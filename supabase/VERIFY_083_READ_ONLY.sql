-- Run in Supabase SQL Editor BEFORE and AFTER the staging migration.
-- Catalog metadata only; no user rows, passwords, tokens or personal content.
SELECT n.nspname AS schema_name,c.relname AS relation,c.relkind,c.relrowsecurity AS rls_enabled,c.relforcerowsecurity AS force_rls,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_select,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','storage') AND c.relkind IN ('r','p','v','m') ORDER BY 1,2;
SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
 FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY 1,2,3;
SELECT n.nspname AS schema_name,p.oid::regprocedure AS signature,p.prosecdef AS security_definer,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
 p.proconfig AS settings
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' ORDER BY 2;
SELECT id,public,file_size_limit,allowed_mime_types FROM storage.buckets ORDER BY id;
-- Views without security_invoker may bypass underlying RLS. Review any exposed views.
SELECT c.relname,c.reloptions,has_table_privilege('authenticated',c.oid,'SELECT') AS client_select
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m') ORDER BY 1;
-- Expected: no anonymous execute on the reports and no authenticated execute on office marketing summary.
SELECT p.oid::regprocedure AS signature,has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,p.prosecdef
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('rv_office_marketing_summary','rv_brokerage_sales_leaderboard');
