-- Requires 084–086 and 088. Staging first. No billing or workspace changes.
BEGIN;
CREATE OR REPLACE FUNCTION public.rv_platform_directory(p_mode text,p_brokerage uuid DEFAULT NULL,p_offset integer DEFAULT 0,p_search text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q text:=lower(left(btrim(coalesce(p_search,'')),200)); offn integer:=greatest(0,least(coalesce(p_offset,0),1000000)); result jsonb;
BEGIN
 IF public.rv_platform_email_verified() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Verified platform owner required' USING ERRCODE='42501'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('brokerages','members','independent','owners') OR (p_mode='members' AND p_brokerage IS NULL) THEN RAISE EXCEPTION 'Invalid directory request'; END IF;
 IF p_mode='brokerages' THEN
  WITH groups AS (
   SELECT b.id,b.name,(SELECT count(*) FROM public.brokerage_members m WHERE m.brokerage_id=b.id) AS member_count,
    (SELECT count(*) FROM public.office_agents a WHERE a.brokerage_id=b.id AND a.status='Invited' AND a.user_id IS NULL) AS invitation_count
   FROM public.brokerages b WHERE q='' OR strpos(lower(b.name),q)>0 OR EXISTS (
    SELECT 1 FROM public.brokerage_members m JOIN auth.users u ON u.id=m.user_id LEFT JOIN public.agent_workspace_profiles p ON p.user_id=u.id
    WHERE m.brokerage_id=b.id AND strpos(lower(concat_ws(' ',u.email,p.full_name,u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name')),q)>0)
    OR EXISTS(SELECT 1 FROM public.office_agents a WHERE a.brokerage_id=b.id AND strpos(lower(concat_ws(' ',a.full_name,a.email)),q)>0)
  ), page AS (SELECT * FROM groups ORDER BY lower(name),id LIMIT 50 OFFSET offn)
  SELECT jsonb_build_object('total',(SELECT count(*) FROM groups),'rows',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY lower(name),id) FROM page),'[]'::jsonb)) INTO result;
 ELSE
  WITH identities AS (
   SELECT u.id,u.email,coalesce(nullif(p.full_name,''),nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),oa.full_name,'') AS account_name,
    b.name AS brokerage,m.role AS brokerage_role,u.last_sign_in_at,u.email_confirmed_at IS NOT NULL AS verified,
    coalesce(u.banned_until>now(),false) AS banned,EXISTS(SELECT 1 FROM rv_platform_private.admins a WHERE a.user_id=u.id) AS platform_owner,
    false AS invited,EXISTS(SELECT 1 FROM rv_platform_private.account_reviews a WHERE a.user_id=u.id) AS deletion_requested
   FROM auth.users u LEFT JOIN public.brokerage_members m ON m.user_id=u.id LEFT JOIN public.brokerages b ON b.id=m.brokerage_id
   LEFT JOIN public.agent_workspace_profiles p ON p.user_id=u.id
   LEFT JOIN LATERAL (SELECT a.full_name FROM public.office_agents a WHERE a.user_id=u.id AND a.brokerage_id=m.brokerage_id ORDER BY a.id LIMIT 1) oa ON true
   WHERE (p_mode='members' AND m.brokerage_id=p_brokerage)
      OR (p_mode='independent' AND m.user_id IS NULL AND NOT EXISTS(SELECT 1 FROM rv_platform_private.admins a WHERE a.user_id=u.id))
      OR (p_mode='owners' AND EXISTS(SELECT 1 FROM rv_platform_private.admins a WHERE a.user_id=u.id))
   UNION ALL
   SELECT a.id,a.email,a.full_name,b.name,'agent'::text,NULL::timestamptz,false,false,false,true,false
   FROM public.office_agents a JOIN public.brokerages b ON b.id=a.brokerage_id
   WHERE p_mode='members' AND a.brokerage_id=p_brokerage AND a.status='Invited' AND a.user_id IS NULL
  ), filtered AS (SELECT * FROM identities WHERE q='' OR strpos(lower(concat_ws(' ',account_name,email,brokerage)),q)>0),
  page AS (SELECT * FROM filtered ORDER BY CASE WHEN platform_owner THEN 0 WHEN brokerage_role='admin' THEN 1 WHEN invited THEN 3 ELSE 2 END,lower(account_name),lower(email),id LIMIT 50 OFFSET offn)
  SELECT jsonb_build_object('total',(SELECT count(*) FROM filtered),'rows',coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY CASE WHEN platform_owner THEN 0 WHEN brokerage_role='admin' THEN 1 WHEN invited THEN 3 ELSE 2 END,lower(account_name),lower(email),id) FROM page),'[]'::jsonb)) INTO result;
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rv_platform_directory(text,uuid,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rv_platform_directory(text,uuid,integer,text) TO authenticated;
-- Actual deletion is deliberately restricted to empty test environments. No cascade over business records.
-- This is NOT a general production erasure workflow. Existing data requires a review or the separately supplied full test reset.
CREATE OR REPLACE FUNCTION public.rv_platform_delete_unused_test_account(p_user uuid,p_email text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r record; actual_email text; has_rows boolean;
BEGIN
 IF public.rv_platform_email_verified() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Verified platform owner required' USING ERRCODE='42501'; END IF;
 IF p_user IS NULL OR p_user=auth.uid() OR EXISTS(SELECT 1 FROM rv_platform_private.admins WHERE user_id=p_user) THEN RAISE EXCEPTION 'Platform owner is protected'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(890089);
 -- Lock reviewed public relations, preventing writes while checking an empty test environment.
 FOR r IN SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.oid LOOP
  EXECUTE format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE',r.nspname,r.relname);
 END LOOP;
 LOCK TABLE storage.objects IN SHARE ROW EXCLUSIVE MODE;
 SELECT email INTO actual_email FROM auth.users WHERE id=p_user FOR UPDATE;
 IF NOT FOUND OR actual_email IS NULL OR lower(actual_email) IS DISTINCT FROM lower(btrim(p_email)) THEN RAISE EXCEPTION 'Account or confirmation email does not match'; END IF;
 IF EXISTS(SELECT 1 FROM public.brokerage_members m WHERE m.user_id=p_user AND m.role='admin' AND NOT EXISTS(SELECT 1 FROM public.brokerage_members other WHERE other.brokerage_id=m.brokerage_id AND other.role='admin' AND other.user_id<>p_user)) THEN RAISE EXCEPTION 'Cannot delete the last brokerage administrator. Use the reviewed test reset or appoint another administrator first'; END IF;
 IF EXISTS(SELECT 1 FROM storage.objects) THEN RAISE EXCEPTION 'Storage contains files. Use deletion review or the approved test reset'; END IF;
 -- Unknown or populated business tables block direct deletion. Identity/settings rows are the only exceptions.
 FOR r IN SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname NOT IN ('brokerages','brokerage_members','office_agents','agent_workspace_profiles','workspace_settings','brand_kits') LOOP
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I)',r.nspname,r.relname) INTO has_rows;
  IF has_rows THEN RAISE EXCEPTION 'Direct test deletion blocked: business or unreviewed records exist in %. Use deletion review or approved test reset',r.relname; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.office_agents WHERE reviewer_id=p_user AND user_id IS DISTINCT FROM p_user) THEN RAISE EXCEPTION 'Account is assigned as an agent reviewer; reassign before deletion'; END IF;
 IF EXISTS(SELECT 1 FROM public.office_agents WHERE user_id IS NULL AND lower(email)=lower(actual_email)) THEN RAISE EXCEPTION 'Pending invitation uses this email. Resolve the invitation before deleting'; END IF;
 -- Refuse unexpected populated platform-private relations too. Preserve known platform records.
 FOR r IN SELECT n.nspname,c.relname FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='rv_platform_private' AND c.relkind IN ('r','p') AND c.relname NOT IN ('admins','audit','plans','plan_assignments','account_reviews','email_challenges') LOOP
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I)',r.nspname,r.relname) INTO has_rows;
  IF has_rows THEN RAISE EXCEPTION 'Unreviewed platform records exist; use deletion review'; END IF;
 END LOOP;
 -- No external records or files are deleted here. FK errors roll the whole transaction back.
 DELETE FROM public.office_agents WHERE user_id=p_user;
 DELETE FROM public.brokerage_members WHERE user_id=p_user;
 DELETE FROM public.agent_workspace_profiles WHERE user_id=p_user;
 DELETE FROM public.workspace_settings WHERE user_id=p_user;
 DELETE FROM public.brand_kits WHERE user_id=p_user;
 DELETE FROM auth.users WHERE id=p_user;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=p_user) THEN RAISE EXCEPTION 'Account deletion failed'; END IF;
 INSERT INTO rv_platform_private.audit(actor_id,action) VALUES(auth.uid(),'Deleted unused test account: '||p_user::text);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.rv_platform_delete_unused_test_account(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rv_platform_delete_unused_test_account(uuid,text) TO authenticated;
COMMIT;
