-- RealVolt Fix 073: commission receipt and operating-bank ledger posting must be ONE action.
-- Apply AFTER 072_optional_internal_pdfs.sql; test on staging and back up first.
-- No historical deposit is invented: a previously verified file can post its real bank receipt
-- only after an administrator confirms account, date, exact amount and bank reference.
BEGIN;

CREATE OR REPLACE FUNCTION public.rv072_receive_commission_funds(
 p_deal uuid,p_account uuid,p_amount numeric,p_day date,p_reference text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 d public.deal_files;
 a public.office_bank_accounts;
 prior public.office_ledger;
 posted uuid;
 expected_gross numeric;
 expected_gst numeric;
 expected_total numeric;
 clean_reference text:=btrim(coalesce(p_reference,''));
 was_verified boolean;
BEGIN
 -- Serialization is on the DEAL, so simultaneous clicks cannot create two deposits.
 SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR d.brokerage_id IS NULL
    OR NOT public.is_brokerage_admin(d.brokerage_id)
    OR d.kind<>'Sale' OR d.rv_stage<>'Completed'
    OR d.review_status<>'Approved' OR d.deposit_holder<>'other_brokerage'
    OR d.rv_completion_letter IS NULL THEN
    RAISE EXCEPTION 'An approved, completed sale with lawyer letter and authorized Back Office user is required';
 END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_day IS NULL
    OR p_day>(now() at time zone 'America/Vancouver')::date
    OR length(clean_reference)<4 THEN
    RAISE EXCEPTION 'Enter actual bank receipt amount, bank date and a real cheque/EFT reference';
 END IF;
 SELECT * INTO a FROM public.office_bank_accounts WHERE id=p_account FOR UPDATE;
 IF NOT FOUND OR a.brokerage_id IS DISTINCT FROM d.brokerage_id
    OR a.kind<>'Operating' OR NOT a.active THEN
    RAISE EXCEPTION 'Select an active operating bank account belonging to this brokerage';
 END IF;
 expected_gross:=round(coalesce(CASE WHEN d.representation='listing'
   THEN d.listing_commission ELSE d.selling_commission END,0),2);
 expected_gst:=round(expected_gross*coalesce(d.gst_rate,5)/100,2);
 expected_total:=expected_gross+expected_gst;
 IF expected_gross<=0 OR round(p_amount,2)<>round(expected_total,2) THEN
    RAISE EXCEPTION 'Deposit amount must match brokerage commission % + GST % = %. Check the saved sale commission before recording funds',
      expected_gross,expected_gst,expected_total;
 END IF;

 -- An existing positive operating-ledger entry could already represent these funds.
 -- Never silently add another receipt to a different account/reference or for a partial amount.
 SELECT l.* INTO prior FROM public.office_ledger l
 JOIN public.office_bank_accounts ba ON ba.id=l.account_id AND ba.kind='Operating'
 WHERE l.deal_id=p_deal AND l.amount>0 AND l.brokerage_id=d.brokerage_id
 ORDER BY l.created_at,l.id LIMIT 1 FOR UPDATE OF l;
 IF FOUND THEN
  IF prior.account_id<>p_account OR prior.reference<>clean_reference
     OR round(prior.amount,2)<>round(p_amount,2) THEN
    RAISE EXCEPTION 'An operating-bank receipt already exists for this transaction. Review it in Trust & Bank; do not create a second deposit';
  END IF;
  -- An exact retry is idempotent. Finish verification if this earlier ledger row
  -- was posted manually, but do not post the same funds again.
  IF NOT coalesce(d.rv_funds_verified,false) THEN
    PERFORM public.rv_tx_action(p_deal,'funds',null,null,'Operating bank receipt '||clean_reference||', CAD '||round(p_amount,2)::text);
  END IF;
  RETURN prior.id;
 END IF;

 was_verified:=coalesce(d.rv_funds_verified,false);
 posted:=public.post_office_entry(p_account,p_deal,p_day,
   'Commission receipt — gross CAD '||expected_gross::text||', GST CAD '||expected_gst::text,
   p_amount,clean_reference,null);
 IF NOT was_verified THEN
   PERFORM public.rv_tx_action(p_deal,'funds',null,null,
      'Operating bank receipt '||clean_reference||', CAD '||round(p_amount,2)::text);
 ELSE
   -- Legacy records marked 'received' without a ledger entry are repaired only
   -- after the admin supplies the actual bank details. No second verification event.
   INSERT INTO public.transaction_audit_events(deal_id,actor_id,action,new_values)
   VALUES (p_deal,auth.uid(),'Previously verified commission linked to operating bank ledger',
     jsonb_build_object('ledger_id',posted,'account_id',p_account,'receipt_date',p_day,
       'reference',clean_reference,'commission_before_gst',expected_gross,
       'brokerage_gst',expected_gst,'amount',round(p_amount,2)));
 END IF;
 RETURN posted;
END $$;
REVOKE ALL ON FUNCTION public.rv072_receive_commission_funds(uuid,uuid,numeric,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv072_receive_commission_funds(uuid,uuid,numeric,date,text) TO authenticated;

-- Prevent the older 'Verify receipt' lifecycle action from setting the verified flag
-- without a matching operating ledger receipt for external-deposit transactions.
CREATE OR REPLACE FUNCTION public.rv073_external_receipt_requires_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE expected_total numeric;
BEGIN
 IF new.kind='Sale' AND new.deposit_holder='other_brokerage'
    AND new.rv_funds_verified IS TRUE AND old.rv_funds_verified IS DISTINCT FROM TRUE THEN
  expected_total:=round(coalesce(CASE WHEN new.representation='listing'
    THEN new.listing_commission ELSE new.selling_commission END,0)
    *(1+coalesce(new.gst_rate,5)/100),2);
  IF expected_total<=0 OR NOT EXISTS(
    SELECT 1 FROM public.office_ledger l
    JOIN public.office_bank_accounts a ON a.id=l.account_id
    WHERE l.deal_id=new.id AND l.brokerage_id=new.brokerage_id
      AND a.brokerage_id=new.brokerage_id AND a.kind='Operating'
      AND l.amount>0 AND round(l.amount,2)=expected_total
  ) THEN
    RAISE EXCEPTION 'Record commission funds using Commission & Agent Payout; the same action creates the operating-account bank receipt';
  END IF;
 END IF;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS rv073_external_receipt_ledger_gate ON public.deal_files;
CREATE TRIGGER rv073_external_receipt_ledger_gate
 BEFORE UPDATE OF rv_funds_verified ON public.deal_files
 FOR EACH ROW EXECUTE FUNCTION public.rv073_external_receipt_requires_ledger();
COMMIT;
