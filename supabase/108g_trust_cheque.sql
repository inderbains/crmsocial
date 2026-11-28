BEGIN;
-- Prepare on the original Trust account, not on the brokerage operating account.
CREATE OR REPLACE FUNCTION public.rv108_prepare_trust_cheque(p_payout uuid,p_number text,p_day date,p_memo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.agent_payouts; d public.deal_files; r public.office_ledger; a public.office_bank_accounts; recipient text; rid uuid; bal numeric;
BEGIN
 SELECT * INTO p FROM public.agent_payouts WHERE id=p_payout;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payout unavailable'; END IF;
 d:=public.rv108_admin(p.deal_id);
 SELECT * INTO p FROM public.agent_payouts WHERE id=p_payout AND deal_id=d.id AND brokerage_id=d.brokerage_id FOR UPDATE;
 IF NOT FOUND OR p.status IS DISTINCT FROM 'Authorized' OR p.net<=0 OR d.rv_stage IS DISTINCT FROM 'Completed' OR d.rv_funds_verified IS NOT TRUE OR d.rv108_commission_receipt_id IS NULL OR d.rv_completed_date IS NULL OR p_day IS NULL OR p_day<d.rv_completed_date OR p_day>(now() AT TIME ZONE 'America/Vancouver')::date OR coalesce(p_number,'') !~ '^[0-9]{1,12}$' OR length(coalesce(p_memo,''))>90 THEN RAISE EXCEPTION 'Authorized completed Trust payout and valid cheque details required'; END IF;
 IF p_number::numeric<=0 THEN RAISE EXCEPTION 'Cheque number must be positive'; END IF;
 IF p.net>public.rv108_expected(d) OR EXISTS(SELECT 1 FROM public.agent_deal_charges c WHERE c.deal_id=d.id AND c.category NOT IN ('Office fee','Office deduction') AND c.amount+c.gst>0) THEN RAISE EXCEPTION 'Review nonstandard deductions or commission shortfall'; END IF;
 IF EXISTS(SELECT 1 FROM public.office_cheques WHERE payout_id=p.id AND status<>'Voided') OR EXISTS(SELECT 1 FROM public.office_eft_instructions WHERE payout_id=p.id AND status<>'Cancelled') THEN RAISE EXCEPTION 'An active payment instruction exists'; END IF;
 PERFORM id FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id ORDER BY id FOR UPDATE;
 r:=public.rv108_receipt(d);
 SELECT * INTO a FROM public.office_bank_accounts WHERE id=r.account_id AND brokerage_id=d.brokerage_id AND kind='Trust' AND active;
 IF NOT FOUND OR r.entry_date>p_day THEN RAISE EXCEPTION 'Original Trust account unavailable'; END IF;
 SELECT coalesce(sum(amount),0) INTO bal FROM public.office_ledger WHERE account_id=a.id AND deal_id=d.id AND entry_date<=p_day;
 IF bal<>public.rv108_expected(d) THEN RAISE EXCEPTION 'Unexpected Trust movements; review before preparing payment'; END IF;
 recipient:=btrim(coalesce(nullif(p.snapshot->'plan'->>'payee_name',''),p.snapshot->'plan'->>'full_name',''));
 IF length(recipient) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'Verify agent legal payee name'; END IF;
 INSERT INTO public.office_cheques(brokerage_id,account_id,deal_id,payout_id,cheque_number,payee,payment_date,amount,memo,snapshot,created_by)
 VALUES(d.brokerage_id,a.id,d.id,p.id,p_number,recipient,p_day,p.net,coalesce(p_memo,''),jsonb_build_object('brokerage',(SELECT to_jsonb(b) FROM public.brokerages b WHERE b.id=d.brokerage_id),'transaction',to_jsonb(d),'payout',to_jsonb(p),'account_name',a.name,'account_kind',a.kind),auth.uid()) RETURNING id INTO rid;
 RETURN rid;
END; $$;
REVOKE ALL ON FUNCTION public.rv108_prepare_trust_cheque(uuid,text,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv108_prepare_trust_cheque(uuid,text,date,text) TO authenticated;
-- Prevent legacy preparation screens from issuing new Operating-funded commission instructions.
CREATE OR REPLACE FUNCTION public.rv108_guard_commission_instruction() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deal_files; r public.office_ledger;
BEGIN
 IF NEW.payout_id IS NULL THEN RETURN NEW; END IF;
 SELECT f.* INTO d FROM public.agent_payouts p JOIN public.deal_files f ON f.id=p.deal_id AND f.brokerage_id=p.brokerage_id WHERE p.id=NEW.payout_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payout unavailable'; END IF;
 IF d.deposit_holder='other_brokerage' THEN RETURN NEW; END IF;
 IF d.deposit_holder IS DISTINCT FROM 'our_brokerage' OR d.rv108_commission_receipt_id IS NULL OR d.rv_stage IS DISTINCT FROM 'Completed' OR d.rv_funds_verified IS NOT TRUE THEN RAISE EXCEPTION 'Use the new transaction Trust settlement workflow'; END IF;
 r:=public.rv108_receipt(d);
 IF NEW.account_id IS DISTINCT FROM r.account_id OR NEW.brokerage_id IS DISTINCT FROM d.brokerage_id THEN RAISE EXCEPTION 'Agent commission must use the original Trust account; do not use General'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rv108_commission_instruction ON public.office_cheques;
CREATE TRIGGER rv108_commission_instruction BEFORE INSERT ON public.office_cheques FOR EACH ROW EXECUTE FUNCTION public.rv108_guard_commission_instruction();
DROP TRIGGER IF EXISTS rv108_commission_instruction ON public.office_eft_instructions;
CREATE TRIGGER rv108_commission_instruction BEFORE INSERT ON public.office_eft_instructions FOR EACH ROW EXECUTE FUNCTION public.rv108_guard_commission_instruction();
COMMIT;
