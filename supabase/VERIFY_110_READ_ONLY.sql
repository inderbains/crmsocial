SELECT 'charge table RLS' AS check_name, coalesce((SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.rv110_agent_charges')),false) AS ok
UNION ALL SELECT 'agent read policy', EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rv110_agent_charges' AND policyname='rv110_charge_read')
UNION ALL SELECT 'no direct authenticated inserts', NOT has_table_privilege('authenticated','public.rv110_agent_charges','INSERT')
UNION ALL SELECT 'no direct authenticated updates', NOT has_table_privilege('authenticated','public.rv110_agent_charges','UPDATE')
UNION ALL SELECT 'add charge RPC', to_regprocedure('public.rv110_add_charge(uuid,date,text,text,text,numeric,numeric,text)') IS NOT NULL
UNION ALL SELECT 'assign charge RPC', to_regprocedure('public.rv110_assign_charge(uuid,uuid)') IS NOT NULL
UNION ALL SELECT 'link receipt RPC', to_regprocedure('public.rv110_link_charge_receipt(uuid,uuid)') IS NOT NULL
UNION ALL SELECT 'status RPC', to_regprocedure('public.rv110_charge_status(uuid)') IS NOT NULL
UNION ALL SELECT 'linked deduction guard', EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='rv110_lock_linked_charge' AND tgrelid='public.agent_deal_charges'::regclass AND tgenabled<>'D');
