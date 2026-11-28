SELECT 'expense table' AS check_name, to_regclass('public.rv109_office_expenses') IS NOT NULL AS ok
UNION ALL SELECT 'private agent expense table', to_regclass('public.rv109_agent_expenses') IS NOT NULL
UNION ALL SELECT 'expense posting RPC',to_regprocedure('public.rv109_post_expense(uuid,text,text,numeric,text,boolean)') IS NOT NULL
UNION ALL SELECT 'both tables RLS enabled',(SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('rv109_office_expenses','rv109_agent_expenses') AND c.relrowsecurity)
UNION ALL SELECT 'private owner policy',EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rv109_agent_expenses' AND policyname='rv109_private_expenses')
UNION ALL SELECT 'no direct office expense insert',NOT has_table_privilege('authenticated','public.rv109_office_expenses','INSERT')
UNION ALL SELECT 'no anonymous RPC access',NOT has_function_privilege('anon','public.rv109_post_expense(uuid,text,text,numeric,text,boolean)','EXECUTE');
