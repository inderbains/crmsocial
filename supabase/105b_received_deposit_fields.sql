BEGIN;
ALTER TABLE public.deal_files ADD COLUMN IF NOT EXISTS rv105_received_on date,
 ADD COLUMN IF NOT EXISTS rv105_receipt_document uuid,
 ADD COLUMN IF NOT EXISTS rv105_receipt_ledger_id uuid,
 ADD COLUMN IF NOT EXISTS rv105_receipt_status text;
CREATE OR REPLACE FUNCTION public.rv105_guard_receipt_fields() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.rv105_received_on IS NOT NULL OR NEW.rv105_receipt_document IS NOT NULL OR NEW.rv105_receipt_ledger_id IS NOT NULL OR NEW.rv105_receipt_status IS NOT NULL THEN RAISE EXCEPTION 'Use the deposit receipt action'; END IF;
 ELSE
   IF current_user IN ('authenticated','anon') AND ROW(NEW.rv105_received_on,NEW.rv105_receipt_document,NEW.rv105_receipt_ledger_id,NEW.rv105_receipt_status) IS DISTINCT FROM ROW(OLD.rv105_received_on,OLD.rv105_receipt_document,OLD.rv105_receipt_ledger_id,OLD.rv105_receipt_status) THEN RAISE EXCEPTION 'Use the deposit receipt action'; END IF;
   IF OLD.rv105_received_on IS NOT NULL AND ROW(NEW.deposit_amount,NEW.deposit_holder,NEW.deposit_brokerage) IS DISTINCT FROM ROW(OLD.deposit_amount,OLD.deposit_holder,OLD.deposit_brokerage) THEN RAISE EXCEPTION 'Recorded deposit details are locked. Contact Back Office for an audited correction'; END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rv105_guard_receipt_fields ON public.deal_files;
CREATE TRIGGER rv105_guard_receipt_fields BEFORE INSERT OR UPDATE ON public.deal_files FOR EACH ROW EXECUTE FUNCTION public.rv105_guard_receipt_fields();
COMMIT;
