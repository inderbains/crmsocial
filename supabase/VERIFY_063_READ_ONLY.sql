-- Read-only verification. Expect required=true for CPS, commission, disclosure, ID;
-- required=false for addenda. Never execute this as a mutation.
SELECT kind,phase,representation,label,required,active,COUNT(*) AS brokerages
FROM public.rv_compliance_templates
WHERE kind='Sale' AND phase='offer'
GROUP BY kind,phase,representation,label,required,active
ORDER BY representation,label,required;

SELECT d.id,d.kind,d.rv_stage,d.review_status,d.address,
 COUNT(*) FILTER (WHERE r.rv_phase='offer' AND r.rv_required) AS required_offer_forms,
 COUNT(*) FILTER (WHERE r.rv_phase='offer' AND r.rv_required AND r.document_id IS NOT NULL) AS linked_offer_forms
FROM public.deal_files d
LEFT JOIN public.deal_requirements r ON r.deal_id=d.id
WHERE d.kind='Sale' AND d.rv_stage='Accepted offer'
GROUP BY d.id,d.kind,d.rv_stage,d.review_status,d.address
ORDER BY d.address LIMIT 30;
