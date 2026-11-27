-- SQL Editor only; read-only. Do not share full results publicly.
SELECT u.email, u.email_confirmed_at IS NOT NULL AS verified,
       a.granted_at, b.name AS existing_brokerage, m.role AS existing_brokerage_role
FROM rv_platform_private.admins a JOIN auth.users u ON u.id=a.user_id
LEFT JOIN public.brokerage_members m ON m.user_id=u.id
LEFT JOIN public.brokerages b ON b.id=m.brokerage_id;
SELECT has_schema_privilege('anon','rv_platform_private','USAGE') AS anon_schema_access,
       has_schema_privilege('authenticated','rv_platform_private','USAGE') AS user_schema_access,
       has_function_privilege('anon','public.rv_platform_admin_overview(integer,text)','EXECUTE') AS anon_overview_access,
       has_table_privilege('authenticated','rv_platform_private.admins','INSERT') AS user_can_grant_owner;
-- Expected: exactly one verified owner, all four access checks false.
