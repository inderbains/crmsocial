BEGIN;
-- Replace legacy guards only: new verification requires linked Trust funds, not a General receipt.
CREATE OR REPLACE FUNCTION public.rv106_guard_transfer() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.rv106_trust_transfer_id IS NOT NULL OR NEW.rv106_general_transfer_id IS NOT NULL THEN RAISE EXCEPTION 'Legacy full commission transfers are disabled'; END IF;
 ELSIF ROW(NEW.rv106_trust_transfer_id,NEW.rv106_general_transfer_id) IS DISTINCT FROM ROW(OLD.rv106_trust_transfer_id,OLD.rv106_general_transfer_id) THEN RAISE EXCEPTION 'Legacy full commission transfers are disabled'; END IF;
 RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.rv108_internal_receipt_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.office_ledger; balance numeric;
BEGIN
 IF NEW.kind='Sale' AND NEW.deposit_holder='our_brokerage' AND NEW.rv_funds_verified IS TRUE AND OLD.rv_funds_verified IS DISTINCT FROM TRUE THEN
  IF NEW.rv_stage IS DISTINCT FROM 'Completed' OR NEW.rv108_commission_receipt_id IS NULL THEN RAISE EXCEPTION 'Use the earned commission action after legal completion'; END IF;
  r:=public.rv108_receipt(NEW);
  IF NEW.rv108_commission_receipt_id<>r.id THEN RAISE EXCEPTION 'Commission must be linked to original Trust receipt'; END IF;
  SELECT coalesce(sum(amount),0) INTO balance FROM public.office_ledger WHERE deal_id=NEW.id AND account_id=r.account_id AND brokerage_id=NEW.brokerage_id;
  IF balance<>public.rv108_expected(NEW) THEN RAISE EXCEPTION 'Retained Trust balance does not equal earned commission'; END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rv108_internal_receipt_gate ON public.deal_files;
CREATE TRIGGER rv108_internal_receipt_gate BEFORE UPDATE OF rv_funds_verified ON public.deal_files FOR EACH ROW EXECUTE FUNCTION public.rv108_internal_receipt_gate();
REVOKE EXECUTE ON FUNCTION public.rv106_record_commission_transfer(uuid,date,text) FROM PUBLIC,anon,authenticated;
-- Internal receipt already exists. No second deposit. External receipt RPC unchanged.
CREATE OR REPLACE FUNCTION public.rv108_confirm_commission(p_deal uuid,p_day date,p_reference text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deal_files; r public.office_ledger; rel public.office_ledger; n integer; aid uuid; posted uuid; total numeric; ref text:=btrim(coalesce(p_reference,'')); prev text;
BEGIN
 d:=public.rv108_admin(p_deal); total:=public.rv108_expected(d);
 IF d.rv_stage IS DISTINCT FROM 'Completed' OR d.rv_completed_date IS NULL OR d.rv_completion_letter IS NULL OR NOT EXISTS(SELECT 1 FROM public.deal_documents doc JOIN storage.objects o ON o.bucket_id='transaction-files' AND o.name=doc.path WHERE doc.id=d.rv_completion_letter AND doc.deal_id=d.id) OR d.rv106_trust_transfer_id IS NOT NULL OR d.rv106_general_transfer_id IS NOT NULL THEN RAISE EXCEPTION 'Legal completion letter and new Trust settlement required; review legacy transfers separately'; END IF;
 PERFORM id FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id ORDER BY id FOR UPDATE;
 IF d.rv_funds_verified THEN
  IF d.rv108_commission_receipt_id IS NOT NULL THEN RETURN d.rv108_commission_receipt_id; END IF;
  RAISE EXCEPTION 'Previously verified funds require accounting review; do not repost';
 END IF;
 SELECT count(*) INTO n FROM public.office_ledger l WHERE l.brokerage_id=d.brokerage_id AND (l.deal_id=d.id OR l.deal_id=d.parent_listing_id);
 IF d.deposit_holder='our_brokerage' THEN
  r:=public.rv108_receipt(d);
  IF r.amount<total THEN RAISE EXCEPTION 'Deposit shortfall requires separate accounting review'; END IF;
  IF r.amount=total THEN
   IF n<>1 OR d.rv108_lawyer_release_id IS NOT NULL THEN RAISE EXCEPTION 'Unexpected Trust movements'; END IF;
  ELSE
   SELECT * INTO rel FROM public.office_ledger l WHERE l.id=d.rv108_lawyer_release_id AND l.deal_id=d.id AND l.brokerage_id=d.brokerage_id AND l.account_id=r.account_id AND l.amount=total-r.amount AND l.reverses_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.office_ledger x WHERE x.reverses_id=l.id);
   IF n<>2 OR rel.id IS NULL OR rel.entry_date>d.rv_completed_date THEN RAISE EXCEPTION 'Record the authorized pre-completion lawyer balance disbursement first'; END IF;
  END IF;
  posted:=r.id;
 ELSE RAISE EXCEPTION 'Deposit holder missing'; END IF;
 prev:=current_setting('realvolt.lifecycle_rpc',true); PERFORM set_config('realvolt.lifecycle_rpc','yes',true);
 UPDATE public.deal_files SET rv108_commission_receipt_id=posted WHERE id=d.id;
 PERFORM public.rv_tx_action(d.id,'funds',NULL,NULL,'Earned commission held in Trust; receipt '||posted::text);
 PERFORM set_config('realvolt.lifecycle_rpc',coalesce(prev,'no'),true);
 INSERT INTO public.transaction_audit_events(deal_id,actor_id,action,new_values) VALUES(d.id,auth.uid(),'Earned commission available in Trust',jsonb_build_object('receipt_id',posted,'amount',total));
 RETURN posted;
END; $$;
REVOKE ALL ON FUNCTION public.rv108_confirm_commission(uuid,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv108_confirm_commission(uuid,date,text) TO authenticated;
COMMIT;
