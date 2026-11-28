SELECT to_regprocedure('public.rv114_archive_agent(uuid,text,text)') IS NOT NULL AS function_present,
 has_function_privilege('authenticated','public.rv114_archive_agent(uuid,text,text)','EXECUTE') AS authenticated_execute,
 NOT has_function_privilege('anon','public.rv114_archive_agent(uuid,text,text)','EXECUTE') AS anonymous_blocked,
 coalesce((SELECT prosecdef FROM pg_proc WHERE oid=to_regprocedure('public.rv114_archive_agent(uuid,text,text)')),false) AS security_definer;
