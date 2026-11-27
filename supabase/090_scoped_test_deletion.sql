-- Fix 090: explicit, scoped deletion of unused TEST identities and empty TEST brokerages.
-- Install on staging first. No data is deleted on installation. Requires 089.
BEGIN;
CREATE OR REPLACE FUNCTION rv_platform_private.lock_test_deletion() RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r record;
BEGIN
 PERFORM pg_catalog.set_config('lock_timeout','5s',true);
 PERFORM pg_catalog.pg_advisory_xact_lock(890089);
 FOR r IN SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','rv_platform_private') AND c.relkind IN ('r','p') ORDER BY c.oid LOOP
  EXECUTE format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE',r.nspname,r.relname);
 END LOOP;
 LOCK TABLE storage.objects IN SHARE ROW EXCLUSIVE MODE;
END $$;
-- Check every UUID column on application tables, including newly added tables. Ignore only reviewed setup records.
CREATE OR REPLACE FUNCTION rv_platform_private.assert_no_test_refs(p_ids uuid[],p_skip text[]) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r record; hit boolean;
BEGIN
 IF coalesce(cardinality(p_ids),0)=0 THEN RETURN; END IF;
 FOR r IN SELECT n.nspname,c.relname,a.attname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid WHERE ((n.nspname='public' AND NOT(c.relname=ANY(p_skip))) OR (n.nspname='rv_platform_private' AND c.relname NOT IN ('admins','audit','plans','plan_assignments','account_reviews','email_challenges'))) AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped AND a.atttypid='uuid'::regtype ORDER BY c.oid,a.attnum LOOP
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %I.%I WHERE %I = ANY($1))',r.nspname,r.relname,r.attname) INTO hit USING p_ids;
  IF hit THEN RAISE EXCEPTION 'Deletion blocked: selected record has related data in %. Review or use the approved test reset; no records deleted.',r.relname; END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION rv_platform_private.assert_no_test_storage(p_ids uuid[]) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects o CROSS JOIN unnest(p_ids) AS i(id) WHERE to_jsonb(o)->>'owner_id'=i.id::text OR to_jsonb(o)->>'owner'=i.id::text OR i.id::text=ANY(string_to_array(o.name,'/'))) THEN
  RAISE EXCEPTION 'Deletion blocked: selected account or brokerage has uploaded files. Use Storage cleanup and deletion review.';
 END IF;
END $$;
REVOKE ALL ON FUNCTION rv_platform_private.lock_test_deletion(),rv_platform_private.assert_no_test_refs(uuid[],text[]),rv_platform_private.assert_no_test_storage(uuid[]) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.rv_platform_delete_unused_test_account(p_user uuid,p_email text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actual_email text; profiles uuid[]; ids uuid[];
BEGIN
 IF public.rv_platform_email_verified() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Verified platform owner required' USING ERRCODE='42501'; END IF;
 IF p_user IS NULL OR p_user=auth.uid() OR EXISTS(SELECT 1 FROM rv_platform_private.admins WHERE user_id=p_user) THEN RAISE EXCEPTION 'Platform owner is protected'; END IF;
 PERFORM rv_platform_private.lock_test_deletion();
 SELECT email INTO actual_email FROM auth.users WHERE id=p_user FOR UPDATE;
 IF NOT FOUND OR actual_email IS NULL OR lower(actual_email) IS DISTINCT FROM lower(btrim(p_email)) THEN RAISE EXCEPTION 'Account or confirmation email does not match'; END IF;
 IF EXISTS(SELECT 1 FROM public.brokerage_members m WHERE m.user_id=p_user AND m.role='admin' AND NOT EXISTS(SELECT 1 FROM public.brokerage_members o WHERE o.brokerage_id=m.brokerage_id AND o.role='admin' AND o.user_id<>p_user)) THEN RAISE EXCEPTION 'Last brokerage administrator: delete the empty brokerage first or appoint another administrator'; END IF;
 IF EXISTS(SELECT 1 FROM public.office_agents WHERE reviewer_id=p_user AND user_id IS DISTINCT FROM p_user) OR EXISTS(SELECT 1 FROM public.transaction_reviewers WHERE admin_id=p_user AND agent_id<>p_user) THEN RAISE EXCEPTION 'Account reviews other agents. Reassign them before deletion'; END IF;
 IF EXISTS(SELECT 1 FROM public.office_agents WHERE user_id IS NULL AND lower(email)=lower(actual_email)) THEN RAISE EXCEPTION 'Cancel pending invitations for this email first'; END IF;
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO profiles FROM public.office_agents WHERE user_id=p_user;
 ids:=ARRAY[p_user]||profiles;
 PERFORM rv_platform_private.assert_no_test_storage(ids);
 PERFORM rv_platform_private.assert_no_test_refs(ids,ARRAY['brokerage_members','office_agents','office_agent_setup','transaction_reviewers','agent_workspace_profiles','workspace_settings','brand_kits','rv_agent_dashboard_preferences','office_audit_events']);
 -- Preserve office audit records; delete only identity/setup rows. Any FK failure rolls back.
 DELETE FROM public.office_agent_setup WHERE profile_id=ANY(profiles);
 DELETE FROM public.transaction_reviewers WHERE agent_id=p_user;
 DELETE FROM public.office_agents WHERE user_id=p_user;
 DELETE FROM public.brokerage_members WHERE user_id=p_user;
 DELETE FROM public.agent_workspace_profiles WHERE user_id=p_user;
 DELETE FROM public.workspace_settings WHERE user_id=p_user;
 DELETE FROM public.brand_kits WHERE user_id=p_user;
 DELETE FROM public.rv_agent_dashboard_preferences WHERE user_id=p_user;
 DELETE FROM auth.users WHERE id=p_user;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN RAISE EXCEPTION 'Account deletion failed'; END IF;
 INSERT INTO rv_platform_private.audit(actor_id,action) VALUES(auth.uid(),'Deleted unused test account: '||p_user::text);
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.rv_platform_delete_empty_test_brokerage(p_brokerage uuid,p_name text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actual_name text; profiles uuid[]; members uuid[]; ids uuid[];
BEGIN
 IF public.rv_platform_email_verified() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Verified platform owner required' USING ERRCODE='42501'; END IF;
 IF p_brokerage IS NULL THEN RAISE EXCEPTION 'Select a brokerage'; END IF;
 PERFORM rv_platform_private.lock_test_deletion();
 SELECT name INTO actual_name FROM public.brokerages WHERE id=p_brokerage FOR UPDATE;
 IF NOT FOUND OR lower(btrim(actual_name)) IS DISTINCT FROM lower(btrim(p_name)) THEN RAISE EXCEPTION 'Brokerage or confirmation name does not match'; END IF;
 SELECT coalesce(array_agg(id),'{}'::uuid[]) INTO profiles FROM public.office_agents WHERE brokerage_id=p_brokerage;
 SELECT coalesce(array_agg(user_id),'{}'::uuid[]) INTO members FROM public.brokerage_members WHERE brokerage_id=p_brokerage;
 ids:=ARRAY[p_brokerage]||profiles||ARRAY(SELECT id FROM public.office_cheque_layouts WHERE brokerage_id=p_brokerage)||ARRAY(SELECT id FROM public.rv_compliance_templates WHERE brokerage_id=p_brokerage);
 IF EXISTS(SELECT 1 FROM public.office_agents WHERE brokerage_id=p_brokerage AND user_id IS NOT NULL AND NOT(user_id=ANY(members))) THEN RAISE EXCEPTION 'Inconsistent agent membership; review before deletion'; END IF;
 IF EXISTS(SELECT 1 FROM public.transaction_reviewers WHERE (agent_id=ANY(members)) <> (admin_id=ANY(members))) THEN RAISE EXCEPTION 'Cross-brokerage reviewer assignment requires review'; END IF;
 PERFORM rv_platform_private.assert_no_test_storage(ids||members);
 -- Only test setup audits may be removed, never transaction/accounting/other audit history.
 IF EXISTS(SELECT 1 FROM public.office_audit_events WHERE brokerage_id=p_brokerage AND action NOT IN ('office_agents:INSERT','office_agents:UPDATE','office_agent_setup:INSERT','office_agent_setup:UPDATE','office_appearance:INSERT','office_appearance:UPDATE','office_cheque_layouts:INSERT','office_cheque_layouts:UPDATE','member_role')) THEN RAISE EXCEPTION 'Brokerage has retained audit history; use deletion review or approved test reset'; END IF;
 IF EXISTS(SELECT 1 FROM public.brokerage_deal_counters WHERE brokerage_id=p_brokerage AND last_number>0) THEN RAISE EXCEPTION 'Brokerage has issued transaction numbers; use deletion review or approved test reset'; END IF;
 PERFORM rv_platform_private.assert_no_test_refs(ids,ARRAY['brokerages','brokerage_members','office_agents','office_agent_setup','office_audit_events','office_appearance','office_cheque_layouts','office_document_templates','rv_compliance_templates','rv_brokerage_dashboard_preferences','brokerage_deal_counters']);
 -- Delete reviewed test setup only. Retain all login accounts and private user data, including owner.
 DELETE FROM public.office_agent_setup WHERE brokerage_id=p_brokerage;
 DELETE FROM public.transaction_reviewers WHERE agent_id=ANY(members) AND admin_id=ANY(members);
 DELETE FROM public.office_agents WHERE brokerage_id=p_brokerage;
 DELETE FROM public.office_audit_events WHERE brokerage_id=p_brokerage;
 DELETE FROM public.office_appearance WHERE brokerage_id=p_brokerage;
 DELETE FROM public.office_cheque_layouts WHERE brokerage_id=p_brokerage;
 DELETE FROM public.office_document_templates WHERE brokerage_id=p_brokerage;
 DELETE FROM public.rv_compliance_templates WHERE brokerage_id=p_brokerage;
 DELETE FROM public.rv_brokerage_dashboard_preferences WHERE brokerage_id=p_brokerage;
 DELETE FROM public.brokerage_deal_counters WHERE brokerage_id=p_brokerage;
 DELETE FROM public.brokerage_members WHERE brokerage_id=p_brokerage;
 DELETE FROM rv_platform_private.plan_assignments WHERE brokerage_id=p_brokerage;
 DELETE FROM public.brokerages WHERE id=p_brokerage;
 IF EXISTS(SELECT 1 FROM public.brokerages WHERE id=p_brokerage) THEN RAISE EXCEPTION 'Brokerage deletion failed'; END IF;
 INSERT INTO rv_platform_private.audit(actor_id,action) VALUES(auth.uid(),'Deleted empty test brokerage; retained member logins: '||p_brokerage::text);
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.rv_platform_cancel_test_invitation(p_profile uuid,p_email text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.office_agents;
BEGIN
 IF public.rv_platform_email_verified() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Verified platform owner required' USING ERRCODE='42501'; END IF;
 PERFORM rv_platform_private.lock_test_deletion();
 SELECT * INTO a FROM public.office_agents WHERE id=p_profile FOR UPDATE;
 IF NOT FOUND OR a.status<>'Invited' OR a.user_id IS NOT NULL OR lower(a.email) IS DISTINCT FROM lower(btrim(p_email)) THEN RAISE EXCEPTION 'Pending invitation or confirmation email does not match'; END IF;
 PERFORM rv_platform_private.assert_no_test_storage(ARRAY[p_profile]);
 PERFORM rv_platform_private.assert_no_test_refs(ARRAY[p_profile],ARRAY['office_agents','office_agent_setup','office_audit_events']);
 DELETE FROM public.office_agent_setup WHERE profile_id=p_profile;
 DELETE FROM public.office_agents WHERE id=p_profile;
 INSERT INTO rv_platform_private.audit(actor_id,action) VALUES(auth.uid(),'Cancelled pending test invitation: '||p_profile::text);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.rv_platform_delete_unused_test_account(uuid,text),public.rv_platform_delete_empty_test_brokerage(uuid,text),public.rv_platform_cancel_test_invitation(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rv_platform_delete_unused_test_account(uuid,text),public.rv_platform_delete_empty_test_brokerage(uuid,text),public.rv_platform_cancel_test_invitation(uuid,text) TO authenticated;
COMMIT;
