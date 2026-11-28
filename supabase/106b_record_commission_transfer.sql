BEGIN;
CREATE OR REPLACE FUNCTION public.rv106_record_commission_transfer(p_deal uuid,p_day date,p_reference text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deal_files; t public.office_ledger; g public.office_ledger; ta public.office_bank_accounts; ga public.office_bank_accounts; gid uuid; n integer; gross numeric; gst numeric; total numeric; tid uuid; oid uuid; ref text:=btrim(coalesce(p_reference,'')); prev text;
BEGIN
 SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR d.brokerage_id IS NULL OR d.brokerage_id IS DISTINCT FROM public.current_brokerage() OR public.is_brokerage_admin(d.brokerage_id) IS NOT TRUE OR public.can_review_deal(d.user_id) IS NOT TRUE OR d.kind IS DISTINCT FROM 'Sale' OR d.review_status IS DISTINCT FROM 'Approved' OR d.rv_stage IS DISTINCT FROM 'Completed' OR d.rv_deleted_at IS NOT NULL OR d.deposit_holder IS DISTINCT FROM 'our_brokerage' OR d.rv_completed_date IS NULL OR d.rv_completion_letter IS NULL THEN RAISE EXCEPTION 'Authorized reviewer and approved legally completed sale required'; END IF;
 IF p_day IS NULL OR p_day<d.rv_completed_date OR p_day>(now() AT TIME ZONE 'America/Vancouver')::date OR length(ref)<4 OR length(ref)>200 THEN RAISE EXCEPTION 'Enter actual transfer date on or after legal completion and a bank reference (4–200 characters)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.deal_documents x JOIN storage.objects s ON s.bucket_id='transaction-files' AND s.name=x.path WHERE x.id=d.rv_completion_letter AND x.deal_id=d.id) THEN RAISE EXCEPTION 'Lawyer completion letter unavailable'; END IF;
 IF d.representation NOT IN ('listing','selling') OR d.representation IS NULL OR d.gst_rate IS NULL OR d.gst_rate<0 OR d.gst_rate>100 THEN RAISE EXCEPTION 'Check saved commission representation and GST'; END IF;
 gross:=round(coalesce(CASE WHEN d.representation='listing' THEN d.listing_commission ELSE d.selling_commission END,0),2); gst:=round(gross*d.gst_rate/100,2); total:=gross+gst;
 IF gross<=0 THEN RAISE EXCEPTION 'Positive saved own-side commission required'; END IF;
 -- Lock both account types in stable order; existing ledger writer locks the selected bank row.
 PERFORM id FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id ORDER BY id FOR UPDATE;
 IF d.rv106_trust_transfer_id IS NOT NULL OR d.rv106_general_transfer_id IS NOT NULL THEN
  SELECT * INTO t FROM public.office_ledger WHERE id=d.rv106_trust_transfer_id AND deal_id=d.id AND brokerage_id=d.brokerage_id;
  SELECT * INTO g FROM public.office_ledger WHERE id=d.rv106_general_transfer_id AND deal_id=d.id AND brokerage_id=d.brokerage_id;
  IF t.id IS NOT NULL AND g.id IS NOT NULL AND t.amount=-total AND g.amount=total AND t.entry_date=p_day AND g.entry_date=p_day AND t.reference=ref AND g.reference=ref AND d.rv_funds_verified AND NOT EXISTS(SELECT 1 FROM public.office_ledger r WHERE r.reverses_id IN(t.id,g.id)) THEN RETURN g.id; END IF;
  RAISE EXCEPTION 'Transfer already recorded or corrected; review existing ledger, do not post again';
 END IF;
 IF d.rv_funds_verified OR EXISTS(SELECT 1 FROM public.agent_payouts WHERE deal_id=d.id) THEN RAISE EXCEPTION 'Legacy verified funds or payout exists. Review existing entries; do not repost'; END IF;
 -- Require one full receipt on THIS sale. A legacy exact receipt may be used only if the entire related trust history consists of that receipt.
 SELECT count(*) INTO n FROM public.office_ledger l JOIN public.office_bank_accounts a ON a.id=l.account_id AND a.kind='Trust' WHERE l.brokerage_id=d.brokerage_id AND (l.deal_id=d.id OR l.deal_id=d.parent_listing_id);
 IF n<>1 THEN RAISE EXCEPTION 'Expected one recorded Trust receipt and no prior releases. Review existing or missing Trust entries in accounting'; END IF;
 SELECT l.* INTO t FROM public.office_ledger l JOIN public.office_bank_accounts a ON a.id=l.account_id AND a.kind='Trust' AND a.brokerage_id=d.brokerage_id WHERE l.brokerage_id=d.brokerage_id AND l.deal_id=d.id AND l.amount>0 AND l.reverses_id IS NULL;
 IF NOT FOUND OR t.amount IS DISTINCT FROM d.deposit_amount OR t.entry_date>p_day OR (d.rv105_receipt_ledger_id IS NOT NULL AND d.rv105_receipt_ledger_id<>t.id) THEN RAISE EXCEPTION 'Full recorded deposit for this sale is required; review receipt in Trust & Bank'; END IF;
 IF total>t.amount THEN RAISE EXCEPTION 'Deposit does not cover full commission. Partial transfer and external shortfall require separate accounting review'; END IF;
 SELECT * INTO ta FROM public.office_bank_accounts WHERE id=t.account_id AND brokerage_id=d.brokerage_id AND kind='Trust' AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original Trust account unavailable'; END IF;
 SELECT id INTO gid FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id AND kind='Operating' AND active AND rv105_default;
 IF gid IS NULL THEN SELECT count(*) INTO n FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id AND kind='Operating' AND active; IF n=1 THEN SELECT id INTO gid FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id AND kind='Operating' AND active; END IF; END IF;
 IF gid IS NULL THEN RAISE EXCEPTION 'Set the default General account in Trust & Bank'; END IF;
 SELECT * INTO ga FROM public.office_bank_accounts WHERE id=gid AND brokerage_id=d.brokerage_id AND kind='Operating' AND active;
 IF NOT FOUND THEN RAISE EXCEPTION 'General account unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM public.office_ledger l JOIN public.office_bank_accounts a ON a.id=l.account_id AND a.kind='Operating' WHERE l.brokerage_id=d.brokerage_id AND (l.deal_id=d.id OR l.deal_id=d.parent_listing_id) AND l.amount>0) THEN RAISE EXCEPTION 'Existing General receipt found; review it instead of posting duplicate funds'; END IF;
 tid:=public.post_office_entry(ta.id,d.id,p_day,'Authorized own-side commission transfer to General',-total,ref,NULL);
 oid:=public.post_office_entry(ga.id,d.id,p_day,'Commission transfer from Trust — gross CAD '||gross::text||', GST CAD '||gst::text,total,ref,NULL);
 prev:=current_setting('realvolt.lifecycle_rpc',true); PERFORM set_config('realvolt.lifecycle_rpc','yes',true);
 UPDATE public.deal_files SET rv106_trust_transfer_id=tid,rv106_general_transfer_id=oid WHERE id=d.id;
 PERFORM public.rv_tx_action(d.id,'funds',NULL,NULL,'Recorded paired Trust/General transfer: '||ref);
 PERFORM set_config('realvolt.lifecycle_rpc',coalesce(prev,'no'),true);
 INSERT INTO public.transaction_audit_events(deal_id,actor_id,action,new_values) VALUES(d.id,auth.uid(),'Authorized commission transfer recorded',jsonb_build_object('trust_ledger_id',tid,'general_ledger_id',oid,'amount',total,'gst',gst,'reference',ref,'entry_date',p_day));
 RETURN oid;
END; $$;
REVOKE ALL ON FUNCTION public.rv106_record_commission_transfer(uuid,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv106_record_commission_transfer(uuid,date,text) TO authenticated;
COMMIT;
