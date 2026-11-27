-- RealVolt 083: targeted staging hardening. Run after existing migrations and 081/082.
-- Does not grant new data access, delete records, or change money. Review live catalog first.
BEGIN;
-- Required core tables must exist; a missing table aborts the transaction.
ALTER TABLE public.deal_files ENABLE ROW LEVEL SECURITY;
-- Remove the historical broad admin policy and the accepted-offer draft exception.
DROP POLICY IF EXISTS brokerage_admin_profile_deals ON public.deal_files;
DROP POLICY IF EXISTS deal_read ON public.deal_files;
CREATE POLICY deal_read ON public.deal_files FOR SELECT TO authenticated USING (
 (user_id=(SELECT auth.uid()) AND (brokerage_id IS NULL OR brokerage_id=public.current_brokerage()))
 OR (brokerage_id=public.current_brokerage() AND public.is_brokerage_admin(brokerage_id)
     AND public.can_review_deal(user_id) AND review_status IN ('Submitted','Approved','Changes requested'))
);
-- Restrictive policies AND with all existing permissive policies, including future ones.
-- Keep owner access unchanged. Office sees only submitted / previously reviewed states.
DROP POLICY IF EXISTS rv083_deal_boundary ON public.deal_files;
CREATE POLICY rv083_deal_boundary ON public.deal_files AS RESTRICTIVE FOR ALL TO public
 USING ((user_id=(SELECT auth.uid()) AND (brokerage_id IS NULL OR brokerage_id=public.current_brokerage()))
 OR (brokerage_id=public.current_brokerage() AND public.is_brokerage_admin(brokerage_id)
     AND public.can_review_deal(user_id) AND review_status IN ('Submitted','Approved','Changes requested')))
 WITH CHECK ((user_id=(SELECT auth.uid()) AND (brokerage_id IS NULL OR brokerage_id=public.current_brokerage()))
 OR (brokerage_id=public.current_brokerage() AND public.is_brokerage_admin(brokerage_id)
     AND public.can_review_deal(user_id) AND review_status IN ('Submitted','Approved','Changes requested')));
-- Add defense-in-depth guards to known private tables. Preserve original operation grants,
-- foreign-key validation and policies. Optional not-installed modules are listed as NOTICE.
DO $$
DECLARE x record; rel regclass;
BEGIN
 FOR x IN SELECT * FROM (VALUES
 ('crm_contacts','user_id'),('crm_notes','user_id'),('crm_tasks','user_id'),
 ('agent_workspace_profiles','user_id'),('agent_personal_dates','user_id'),('rv_agent_dashboard_preferences','user_id'),
 ('workspace_settings','user_id'),('social_drafts','user_id'),('brand_kits','user_id'),
 ('open_house_events','user_id'),('open_house_checkins','owner_user_id'),
 ('property_showing_requests','user_id'),('property_engagement','owner_user_id'),
 ('buyer_saved_searches','user_id'),('meta_ad_plans','user_id'),
 ('marketing_sender_preferences','user_id'),('marketing_email_campaigns','user_id'),
 ('marketing_automation_preferences','user_id'),('rv_post_sale_followup_plans','user_id'),
 ('rvcrm_real_estate_profiles','user_id'),('rvcrm_contact_deals','user_id'),('rvcrm_ai_drafts','user_id'),
 ('rvcrm_deal_milestones','user_id'),('rvcrm_qualification_audit','user_id'),('rvcrm_followup_nudges','user_id'),
 ('rv_ai_generations','user_id'),('rv_funnel_auto_events','user_id'),('rv_auto_workflows','user_id'),('rv_auto_steps','user_id'),
 ('rv_auto_runs','user_id'),('rv_auto_jobs','user_id'),('rv_auto_email_drafts','user_id')
 ) AS v(tbl,owner_col) LOOP
  rel:=to_regclass(format('public.%I',x.tbl));
  IF rel IS NULL THEN RAISE NOTICE 'Optional table not installed: %',x.tbl; CONTINUE; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=rel AND attname=x.owner_col AND atttypid='uuid'::regtype AND NOT attisdropped) THEN
   RAISE EXCEPTION 'Unexpected owner schema on %. Review before applying 083.',x.tbl;
  END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',x.tbl);
  EXECUTE format('DROP POLICY IF EXISTS rv083_owner_boundary ON public.%I',x.tbl);
  EXECUTE format('CREATE POLICY rv083_owner_boundary ON public.%I AS RESTRICTIVE FOR ALL TO public USING (%I=(SELECT auth.uid())) WITH CHECK (%I=(SELECT auth.uid()))',x.tbl,x.owner_col,x.owner_col);
 END LOOP;
END $$;
-- Dependent file records inherit the parent deal's RLS. No new permission is granted.
DO $$
DECLARE t text; rel regclass;
BEGIN
 FOREACH t IN ARRAY ARRAY['deal_documents','deal_requirements','listing_terms','agent_commission_allocations','agent_deal_charges','transaction_audit_events','closing_deliveries','rv_closed_file_folders','deal_workflow_events'] LOOP
  rel:=to_regclass(format('public.%I',t));
  IF rel IS NULL THEN RAISE NOTICE 'Optional child table not installed: %',t; CONTINUE; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=rel AND attname='deal_id' AND atttypid='uuid'::regtype AND NOT attisdropped) THEN RAISE EXCEPTION 'Unexpected deal_id schema: %',t; END IF;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS rv083_parent_boundary ON public.%I',t);
  EXECUTE format('CREATE POLICY rv083_parent_boundary ON public.%I AS RESTRICTIVE FOR SELECT TO public USING (EXISTS (SELECT 1 FROM public.deal_files d WHERE d.id=%I.deal_id))',t,t);
 END LOOP;
END $$;
-- No other storage bucket is changed. Private transaction downloads must link to a visible deal.
UPDATE storage.buckets SET public=false WHERE id='transaction-files';
DROP POLICY IF EXISTS rv083_transaction_download_boundary ON storage.objects;
CREATE POLICY rv083_transaction_download_boundary ON storage.objects AS RESTRICTIVE FOR SELECT TO public
 USING (bucket_id <> 'transaction-files' OR EXISTS (
  SELECT 1 FROM public.deal_documents f JOIN public.deal_files d ON d.id=f.deal_id WHERE f.path=storage.objects.name
 ));
-- Membership directory is private to the account or authorized brokerage administrator.
DROP POLICY IF EXISTS rv083_membership_boundary ON public.brokerage_members;
CREATE POLICY rv083_membership_boundary ON public.brokerage_members AS RESTRICTIVE FOR SELECT TO public
 USING (user_id=(SELECT auth.uid()) OR public.is_brokerage_admin(brokerage_id));
-- SECURITY DEFINER office reporting bypasses RLS. Suspend private marketing reporting;
-- replace the shared leaderboard with an invoker-scoped submitted-sales report.
-- Revoke every overload in the actual installation, not only the reference signature.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('rv_office_marketing_summary','rv_brokerage_sales_leaderboard','rv_seed_deal_compliance') AND p.prokind='f' LOOP
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.sig);
 END LOOP;
END $$;
-- Preserve the office sales goal and own performance while never exposing another
-- agent's performance to an ordinary agent. No private profile lookup.
CREATE OR REPLACE FUNCTION public.rv_brokerage_sales_leaderboard(p_period text DEFAULT 'month', p_sort text DEFAULT 'volume')
RETURNS TABLE(rank integer,agent_id uuid,agent_name text,sales_count bigint,sales_volume numeric)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE b uuid:=public.current_brokerage(); admin boolean; today date:=(now() AT TIME ZONE 'America/Vancouver')::date; start_day date; end_day date;
BEGIN
 IF auth.uid() IS NULL OR b IS NULL THEN RAISE EXCEPTION 'No brokerage membership for this account' USING ERRCODE='42501'; END IF;
 IF p_period IS NULL OR p_period NOT IN ('month','year') OR p_sort IS NULL OR p_sort NOT IN ('sales','volume') THEN RAISE EXCEPTION 'Invalid report selection'; END IF;
 admin:=public.is_brokerage_admin(b);
 start_day:=date_trunc(p_period,today::timestamp)::date;
 end_day:=CASE WHEN p_period='month' THEN (start_day+interval '1 month')::date ELSE (start_day+interval '1 year')::date END;
 RETURN QUERY WITH totals AS (
 SELECT d.user_id AS uid, coalesce(nullif(max(a.full_name),''),CASE WHEN d.user_id=auth.uid() THEN 'My account' ELSE 'Office agent' END) AS display_name,
 count(*)::bigint AS n, sum(d.sale_price)::numeric AS amount
 FROM public.deal_files d LEFT JOIN public.office_agents a ON a.user_id=d.user_id AND a.brokerage_id=d.brokerage_id
 WHERE d.brokerage_id=b AND (admin OR d.user_id=auth.uid())
 AND d.kind='Sale' AND d.review_status IN ('Submitted','Approved','Changes requested')
 AND d.rv_stage IN ('Sold','Completed','Archived') AND d.sale_price>0
 AND d.rv_firm_date>=start_day AND d.rv_firm_date<end_day AND d.rv_firm_date<=today
 GROUP BY d.user_id
 ) SELECT row_number() OVER (ORDER BY CASE WHEN p_sort='sales' THEN t.n END DESC NULLS LAST,t.amount DESC,t.n DESC,t.uid)::integer,
 t.uid,t.display_name,t.n,t.amount FROM totals t
 ORDER BY CASE WHEN p_sort='sales' THEN t.n END DESC NULLS LAST,t.amount DESC,t.n DESC,t.uid;
END $$;
REVOKE ALL ON FUNCTION public.rv_brokerage_sales_leaderboard(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv_brokerage_sales_leaderboard(text,text) TO authenticated;
COMMIT;
