-- Fix 053 read-only verification: expect four rows with "present" = true.
SELECT required_name,
       to_regprocedure(required_name) IS NOT NULL AS present
FROM (VALUES
 ('public.rv_release_document_snapshot(uuid)'),
 ('public.rv_release_gate_status(uuid)'),
 ('public.rv_approve_commission_release(uuid)'),
 ('public.issue_office_cheque(uuid)')
) AS f(required_name);
SELECT to_regclass('public.rv_commission_release_approvals') IS NOT NULL AS approval_table_present;
