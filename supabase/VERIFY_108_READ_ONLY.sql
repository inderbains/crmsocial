SELECT
 to_regprocedure('public.rv108_record_lawyer_release(uuid,text,date,text,text,numeric)') IS NOT NULL AS lawyer_release_ready,
 to_regprocedure('public.rv108_confirm_commission(uuid,date,text)') IS NOT NULL AS retained_commission_ready,
 to_regprocedure('public.rv108_record_agent_payment(uuid,date,text,text)') IS NOT NULL AS agent_payment_ready,
 to_regprocedure('public.rv108_record_brokerage_share(uuid,date,text,boolean)') IS NOT NULL AS brokerage_share_ready,
 to_regprocedure('public.rv108_prepare_trust_cheque(uuid,text,date,text)') IS NOT NULL AS trust_cheque_ready,
 to_regprocedure('public.rv108_previous_mark_agent_payout_paid(uuid,uuid,date,text)') IS NOT NULL AS previous_payout_preserved,
 has_function_privilege('authenticated','public.rv072_receive_commission_funds(uuid,uuid,numeric,date,text)','EXECUTE') AS external_receipt_preserved,
 NOT has_function_privilege('authenticated','public.rv106_record_commission_transfer(uuid,date,text)','EXECUTE') AS old_internal_transfer_disabled,
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.deal_files'::regclass AND tgname='rv108_trust_before_archive' AND tgenabled<>'D') AS closing_guard_ready;
