-- Read-only installation check. No data is modified.
SELECT
 to_regprocedure('public.rv063_offer_docs_before_firm()') IS NOT NULL AS accepted_offer_guard_present,
 to_regprocedure('public.rv_link_uploaded_compliance_doc(uuid,uuid,text,boolean)') IS NOT NULL AS upload_link_function_present;
SELECT brokerage_id, representation, label, required, active
FROM public.rv_compliance_templates
WHERE kind='Sale' AND phase='offer'
ORDER BY brokerage_id, representation, label;
