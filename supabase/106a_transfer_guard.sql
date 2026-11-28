-- Fix 106: post an actual, authorized full own-side commission transfer atomically.
-- Requires Fix 105 and existing finance/lifecycle migrations. Staging first.
BEGIN;
ALTER TABLE public.deal_files ADD COLUMN IF NOT EXISTS rv106_trust_transfer_id uuid,
 ADD COLUMN IF NOT EXISTS rv106_general_transfer_id uuid;
CREATE OR REPLACE FUNCTION public.rv106_guard_transfer() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.rv106_trust_transfer_id IS NOT NULL OR NEW.rv106_general_transfer_id IS NOT NULL THEN RAISE EXCEPTION 'Use the authorized commission transfer action'; END IF;
  RETURN NEW;
 END IF;
 IF current_user IN ('authenticated','anon') AND ROW(NEW.rv106_trust_transfer_id,NEW.rv106_general_transfer_id) IS DISTINCT FROM ROW(OLD.rv106_trust_transfer_id,OLD.rv106_general_transfer_id) THEN RAISE EXCEPTION 'Use the authorized commission transfer action'; END IF;
 IF NEW.kind='Sale' AND NEW.deposit_holder='our_brokerage' AND NEW.rv_funds_verified IS TRUE AND OLD.rv_funds_verified IS DISTINCT FROM TRUE THEN
  IF NOT EXISTS(SELECT 1 FROM public.office_ledger t JOIN public.office_ledger g ON g.id=NEW.rv106_general_transfer_id
   JOIN public.office_bank_accounts ta ON ta.id=t.account_id JOIN public.office_bank_accounts ga ON ga.id=g.account_id
   WHERE t.id=NEW.rv106_trust_transfer_id AND t.deal_id=NEW.id AND g.deal_id=NEW.id AND t.brokerage_id=NEW.brokerage_id AND g.brokerage_id=NEW.brokerage_id
   AND ta.brokerage_id=NEW.brokerage_id AND ga.brokerage_id=NEW.brokerage_id AND ta.kind='Trust' AND ga.kind='Operating'
   AND t.amount<0 AND g.amount=-t.amount AND g.amount=round(CASE WHEN NEW.representation='listing' THEN NEW.listing_commission ELSE NEW.selling_commission END,2)+round(round(CASE WHEN NEW.representation='listing' THEN NEW.listing_commission ELSE NEW.selling_commission END,2)*coalesce(NEW.gst_rate,5)/100,2)
   AND g.reference=t.reference AND g.entry_date=t.entry_date AND NOT EXISTS(SELECT 1 FROM public.office_ledger r WHERE r.reverses_id IN(t.id,g.id))) THEN
   RAISE EXCEPTION 'Record the actual Trust-to-General commission transfer in Commission & agent payout first';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rv106_guard_transfer ON public.deal_files;
CREATE TRIGGER rv106_guard_transfer BEFORE INSERT OR UPDATE ON public.deal_files FOR EACH ROW EXECUTE FUNCTION public.rv106_guard_transfer();
COMMIT;
