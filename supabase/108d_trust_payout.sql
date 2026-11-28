BEGIN;
-- Preserve the installed external-deposit payout function verbatim under a private callable name.
DO $$ BEGIN
 IF to_regprocedure('public.rv108_previous_mark_agent_payout_paid(uuid,uuid,date,text)') IS NULL THEN
  ALTER FUNCTION public.mark_agent_payout_paid(uuid,uuid,date,text) RENAME TO rv108_previous_mark_agent_payout_paid;
 END IF;
END; $$;
REVOKE ALL ON FUNCTION public.rv108_previous_mark_agent_payout_paid(uuid,uuid,date,text) FROM PUBLIC,anon,authenticated;
-- Existing cheque/EFT settlement uses a holder-scoped dispatcher.
CREATE OR REPLACE FUNCTION public.mark_agent_payout_paid(payout uuid,account uuid,payment_day date,cheque_ref text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.agent_payouts; d public.deal_files; r public.office_ledger; entry uuid; bal numeric; ref text:=btrim(coalesce(cheque_ref,''));
BEGIN
 SELECT * INTO p FROM public.agent_payouts WHERE id=payout;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payout unavailable'; END IF;
 SELECT * INTO d FROM public.deal_files WHERE id=p.deal_id AND brokerage_id=p.brokerage_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR d.brokerage_id IS DISTINCT FROM public.current_brokerage() OR public.is_brokerage_admin(d.brokerage_id) IS NOT TRUE THEN RAISE EXCEPTION 'Payout unavailable'; END IF;
 IF d.deposit_holder='other_brokerage' THEN
  PERFORM public.rv108_previous_mark_agent_payout_paid(payout,account,payment_day,cheque_ref); RETURN;
 END IF;
 d:=public.rv108_admin(p.deal_id);
 SELECT * INTO p FROM public.agent_payouts WHERE id=payout AND deal_id=d.id AND brokerage_id=d.brokerage_id FOR UPDATE;
 IF NOT FOUND OR p.status IS DISTINCT FROM 'Authorized' OR d.rv_stage IS DISTINCT FROM 'Completed' OR d.rv_funds_verified IS NOT TRUE OR d.rv108_commission_receipt_id IS NULL OR d.rv_completed_date IS NULL OR d.rv_completion_letter IS NULL OR payment_day IS NULL OR payment_day<d.rv_completed_date OR payment_day>(now() AT TIME ZONE 'America/Vancouver')::date OR length(ref) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Authorized, completed and Trust-funded payout with actual payment date/reference required'; END IF;
 IF p.net<=0 OR p.gross+p.gst>public.rv108_expected(d) OR p.net>public.rv108_expected(d) OR p.gross+p.gst-p.deductions<>p.net OR p.deductions<0 OR EXISTS(SELECT 1 FROM public.agent_deal_charges c WHERE c.deal_id=d.id AND c.category NOT IN ('Office fee','Office deduction') AND c.amount+c.gst>0) THEN RAISE EXCEPTION 'Zero payouts or third-party deductions require accounting review'; END IF;
 IF EXISTS(SELECT 1 FROM public.office_cheques c WHERE c.payout_id=p.id AND c.status<>'Voided' AND (c.status<>'Prepared' OR c.account_id IS DISTINCT FROM account OR c.payment_date IS DISTINCT FROM payment_day OR c.cheque_number IS DISTINCT FROM ref OR c.amount IS DISTINCT FROM p.net)) OR EXISTS(SELECT 1 FROM public.office_eft_instructions e WHERE e.payout_id=p.id AND e.status<>'Cancelled' AND (e.status<>'Submitted' OR e.account_id IS DISTINCT FROM account OR e.external_reference IS DISTINCT FROM ref OR e.amount IS DISTINCT FROM p.net)) THEN RAISE EXCEPTION 'Existing payment instruction differs from this payment; review before proceeding'; END IF;
 IF NOT coalesce((public.rv_release_gate_status(p.id)->>'approved')::boolean,false) THEN RAISE EXCEPTION 'Review and approve all required compliance documents before commission release'; END IF;
 PERFORM id FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id ORDER BY id FOR UPDATE;
 r:=public.rv108_receipt(d);
 IF account IS DISTINCT FROM r.account_id OR d.rv108_commission_receipt_id<>r.id OR r.entry_date>payment_day THEN RAISE EXCEPTION 'Use the original brokerage Trust account, not General'; END IF;
 SELECT coalesce(sum(amount),0) INTO bal FROM public.office_ledger WHERE account_id=r.account_id AND deal_id=d.id AND brokerage_id=d.brokerage_id AND entry_date<=payment_day;
 IF bal<>public.rv108_expected(d) OR (SELECT count(*) FROM public.office_ledger l WHERE l.brokerage_id=d.brokerage_id AND (l.deal_id=d.id OR l.deal_id=d.parent_listing_id))<>CASE WHEN d.rv108_lawyer_release_id IS NULL THEN 1 ELSE 2 END OR EXISTS(SELECT 1 FROM public.office_ledger l WHERE l.brokerage_id=d.brokerage_id AND l.deal_id=d.id AND l.account_id<>r.account_id) THEN RAISE EXCEPTION 'Unexpected prior ledger movement; review before paying'; END IF;
 entry:=public.post_office_entry(r.account_id,d.id,payment_day,'Agent commission paid from Trust',-p.net,ref,NULL);
 UPDATE public.agent_payouts SET status='Paid',paid_date=payment_day,payment_reference=ref,ledger_id=entry WHERE id=p.id;
 INSERT INTO public.transaction_audit_events(deal_id,actor_id,action,new_values) VALUES(d.id,auth.uid(),'Agent commission paid from Trust',jsonb_build_object('payout_id',p.id,'ledger_id',entry,'amount',p.net,'reference',ref));
END; $$;
-- New transaction-level action for payments already made externally. Do not bypass existing active instructions.
CREATE OR REPLACE FUNCTION public.rv108_record_agent_payment(p_payout uuid,p_day date,p_reference text,p_method text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.agent_payouts; d public.deal_files; r public.office_ledger;
BEGIN
 SELECT * INTO p FROM public.agent_payouts WHERE id=p_payout;
 IF NOT FOUND OR p_method IS NULL OR p_method NOT IN ('Cheque','EFT') OR length(btrim(coalesce(p_reference,''))) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Payout and payment method required'; END IF;
 d:=public.rv108_admin(p.deal_id); PERFORM id FROM public.agent_payouts WHERE id=p_payout FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.office_cheques WHERE payout_id=p_payout AND status<>'Voided') OR EXISTS(SELECT 1 FROM public.office_eft_instructions WHERE payout_id=p_payout AND status<>'Cancelled') THEN RAISE EXCEPTION 'Existing cheque or EFT instruction: review it before recording a payment'; END IF;
 r:=public.rv108_receipt(d);
 PERFORM public.mark_agent_payout_paid(p_payout,r.account_id,p_day,p_method||' '||btrim(coalesce(p_reference,'')));
END; $$;
-- External payout RPC retains its established access. Internal payments enforce the new Trust checks.
REVOKE ALL ON FUNCTION public.mark_agent_payout_paid(uuid,uuid,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_agent_payout_paid(uuid,uuid,date,text) TO authenticated;
REVOKE ALL ON FUNCTION public.rv108_record_agent_payment(uuid,date,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv108_record_agent_payment(uuid,date,text,text) TO authenticated;
COMMIT;
