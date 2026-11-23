-- Run after SQL 048. Non-mutating checks.
SELECT
  to_regprocedure('public.rv_tx_action(uuid,text,date,uuid,text)') IS NOT NULL AS action_function_exists,
  to_regprocedure('public.rv_save_post_firm_details(uuid,uuid,uuid,numeric,numeric,numeric,numeric,text,text)') IS NOT NULL AS sql_047_installed,
  to_regprocedure('public.rv_link_uploaded_compliance_doc(uuid,uuid,text,boolean)') IS NOT NULL AS sql_046_installed,
  EXISTS (
    SELECT 1 FROM public.rv_compliance_templates
    WHERE kind='Sale' AND phase='firm' AND representation='listing'
      AND label='Deposit cheque copy / deposit receipt' AND required
  ) AS seller_deposit_cheque_template_exists;
