-- Read-only inspection of Fix 072 (run under a brokerage-admin SQL context)
SELECT label,rv_required,count(*) AS transaction_rows
FROM public.deal_requirements
WHERE lower(label) IN (
 'brokerage completion confirmation (pdf)',
 'commission instruction report — cir (pdf)',
 'internal commission payable statement (pdf)'
)
GROUP BY label,rv_required ORDER BY label,rv_required;
SELECT to_regprocedure('public.rv072_receive_commission_funds(uuid,uuid,numeric,date,text)') AS atomic_operating_receipt_function,
       to_regprocedure('public.rv_close_compliant_file(uuid)') AS archive_function,
       to_regprocedure('public.rv_release_gate_status(uuid)') AS cheque_release_check_function;
SELECT kind,phase,representation,label,required
FROM public.rv_compliance_templates
WHERE lower(label) IN (
 'brokerage completion confirmation (pdf)',
 'commission instruction report — cir (pdf)',
 'internal commission payable statement (pdf)'
)
ORDER BY kind,phase,label;
