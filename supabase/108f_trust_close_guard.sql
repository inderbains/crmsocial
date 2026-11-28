BEGIN;
-- Preserve other archive rules; no closing a completed internal-deposit file with money still held.
CREATE OR REPLACE FUNCTION public.rv108_trust_before_archive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.kind='Sale' AND OLD.rv_stage='Completed' AND NEW.rv_stage='Archived' AND NEW.deposit_holder='our_brokerage' AND coalesce(NEW.deposit_amount,0)>0 THEN
  PERFORM id FROM public.office_bank_accounts WHERE brokerage_id=NEW.brokerage_id AND kind='Trust' ORDER BY id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM public.office_ledger l JOIN public.office_bank_accounts a ON a.id=l.account_id AND a.brokerage_id=NEW.brokerage_id AND a.kind='Trust' WHERE l.deal_id=NEW.id AND l.brokerage_id=NEW.brokerage_id AND l.amount>0 AND l.reverses_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.office_ledger r WHERE r.reverses_id=l.id)) THEN RAISE EXCEPTION 'No recorded Trust receipt for this completed sale. Review accounting before closing'; END IF;
  IF EXISTS(SELECT 1 FROM public.office_ledger l JOIN public.office_bank_accounts a ON a.id=l.account_id AND a.brokerage_id=NEW.brokerage_id AND a.kind='Trust' WHERE l.brokerage_id=NEW.brokerage_id AND (l.deal_id=NEW.id OR l.deal_id=NEW.parent_listing_id) GROUP BY l.account_id,l.deal_id HAVING sum(l.amount)<>0) THEN RAISE EXCEPTION 'Trust funds remain on this sale or linked listing. Record actual authorized disbursements before closing'; END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rv108_trust_before_archive ON public.deal_files;
CREATE TRIGGER rv108_trust_before_archive BEFORE UPDATE OF rv_stage ON public.deal_files FOR EACH ROW EXECUTE FUNCTION public.rv108_trust_before_archive();
COMMIT;
