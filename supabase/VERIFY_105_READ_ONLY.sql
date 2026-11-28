SELECT
 to_regprocedure('public.rv105_set_default_bank(uuid)') IS NOT NULL AS default_bank_ready,
 to_regprocedure('public.rv105_submit_firm_with_receipt(uuid,date,uuid,text,uuid,uuid,numeric,numeric,numeric,numeric,text,text,date)') IS NOT NULL AS firm_receipt_ready,
 to_regprocedure('public.rv105_record_received_deposit(uuid,date)') IS NOT NULL AS later_receipt_ready,
 to_regprocedure('public.rv105_retry_saved_receipt(uuid)') IS NOT NULL AS retry_ready,
 to_regprocedure('public.rv103_transaction_trust_summary(uuid)') IS NOT NULL AS summary_ready;
