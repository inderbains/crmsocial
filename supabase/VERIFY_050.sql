-- Run after 050 succeeds. Both representation-specific categories should be required.
SELECT representation,label,required,active,COUNT(*) AS brokerage_count
FROM public.rv_compliance_templates
WHERE kind='Sale' AND phase='firm'
 AND (label IN ('Trade record sheet','Sale report form','Receipt of funds'))
GROUP BY representation,label,required,active
ORDER BY representation,label;

-- Confirm function signatures exist (these do not prove application end-to-end).
SELECT
 to_regprocedure('public.rv_tx_action(uuid,text,date,uuid,text)') IS NOT NULL AS action_function_present,
 to_regprocedure('public.rv_link_uploaded_compliance_doc(uuid,uuid,text,boolean)') IS NOT NULL AS upload_link_function_present;
