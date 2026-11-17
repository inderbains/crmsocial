-- REALVOLT PHASE 1 — READ-ONLY RLS / PERMISSION INVENTORY
-- Run in Supabase SQL Editor. Does not change rows, grants, policies, schemas or secrets.
-- IMPORTANT: a public site/listing table may intentionally grant anon SELECT. Interpret findings manually.

-- 1. API-exposed public tables, grants and RLS status.
select
  n.nspname as schema_name,
  c.relname as object_name,
  case c.relkind when 'r' then 'table' when 'p' then 'partitioned table' when 'v' then 'view' when 'm' then 'materialized view' else c.relkind::text end as object_type,
  c.relrowsecurity as rls_enabled,
  case when c.relkind in ('r','p') and not c.relrowsecurity
    and (has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'SELECT'))
    then 'REVIEW: RLS OFF + CLIENT SELECT GRANT' else 'review as needed' end as check_result,
  has_table_privilege('anon',c.oid,'SELECT') as anon_select_granted,
  has_table_privilege('authenticated',c.oid,'SELECT') as signed_in_select_granted,
  has_table_privilege('authenticated',c.oid,'INSERT') as signed_in_insert_granted,
  has_table_privilege('authenticated',c.oid,'UPDATE') as signed_in_update_granted,
  has_table_privilege('authenticated',c.oid,'DELETE') as signed_in_delete_granted
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','m')
order by (case when c.relkind in ('r','p') and not c.relrowsecurity
       and (has_table_privilege('anon',c.oid,'SELECT') or has_table_privilege('authenticated',c.oid,'SELECT'))
  then 0 else 1 end),c.relname;

-- 2. All policies (look for USING(true), overly broad access and missing WITH CHECK).
select schemaname,tablename,policyname,roles,cmd,permissive,qual,with_check
from pg_policies
where schemaname in ('public','storage')
order by schemaname,tablename,policyname;

-- 3. SECURITY DEFINER functions callable by visitors or clients.
-- ANY result should be manually reviewed, not automatically revoked:
-- e.g., approved public open-house registration RPCs are intentionally callable.
select n.nspname as schema_name,
       p.oid::regprocedure::text as function_signature,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as signed_in_can_execute,
       p.proconfig as function_settings
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef
  and (has_function_privilege('anon',p.oid,'EXECUTE')
       or has_function_privilege('authenticated',p.oid,'EXECUTE'))
order by 1,2;

-- 4. Storage bucket exposure (branding/open-house pictures might be intentionally public;
-- signed contracts, transaction documents and identity material should not be).
select id,name,public,file_size_limit,allowed_mime_types
from storage.buckets
order by name;

-- 5. Critical private table checks; null = migration/table missing.
select required.table_name,
       to_regclass('public.'||required.table_name) as installed,
       coalesce(c.relrowsecurity,false) as rls_enabled
from (values ('crm_contacts'),('crm_notes'),('crm_tasks'),
             ('brokerages'),('brokerage_members'),('deal_files'),('deal_documents'),
             ('sign_envelopes'),('sign_recipients'),('sign_events'),
             ('office_ledger'),('agent_payouts'),('office_agents'),
             ('rv_agent_sites'),('rv_agent_site_domains')) as required(table_name)
left join pg_class c on c.oid=to_regclass('public.'||required.table_name)
order by required.table_name;
