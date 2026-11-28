-- Fix 108. Staging/test data only until verified by managing broker and accountant.
BEGIN;
ALTER TABLE public.deal_files ADD COLUMN IF NOT EXISTS rv108_lawyer_release_id uuid,
 ADD COLUMN IF NOT EXISTS rv108_commission_receipt_id uuid,
 ADD COLUMN IF NOT EXISTS rv108_general_credit_id uuid;
CREATE OR REPLACE FUNCTION public.rv108_expected(d public.deal_files) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN d.representation IN ('listing','selling') AND d.gst_rate BETWEEN 0 AND 100 THEN
 round(CASE WHEN d.representation='listing' THEN d.listing_commission ELSE d.selling_commission END,2)
 +round(round(CASE WHEN d.representation='listing' THEN d.listing_commission ELSE d.selling_commission END,2)*d.gst_rate/100,2) END
$$;
CREATE OR REPLACE FUNCTION public.rv108_admin(p_deal uuid) RETURNS public.deal_files
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deal_files;
BEGIN
 SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR d.brokerage_id IS NULL OR d.brokerage_id IS DISTINCT FROM public.current_brokerage() OR public.is_brokerage_admin(d.brokerage_id) IS NOT TRUE OR public.can_review_deal(d.user_id) IS NOT TRUE OR d.kind IS DISTINCT FROM 'Sale' OR d.deposit_holder IS DISTINCT FROM 'our_brokerage' OR d.review_status IS DISTINCT FROM 'Approved' OR d.rv_deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Approved sale and authorized brokerage reviewer required'; END IF;
 IF public.rv108_expected(d) IS NULL OR public.rv108_expected(d)<=0 THEN RAISE EXCEPTION 'Check saved commission and GST'; END IF;
 RETURN d;
END; $$;
CREATE OR REPLACE FUNCTION public.rv108_receipt(d public.deal_files) RETURNS public.office_ledger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.office_ledger;
BEGIN
 SELECT l.* INTO r FROM public.office_ledger l JOIN public.office_bank_accounts a ON a.id=l.account_id AND a.brokerage_id=d.brokerage_id AND a.kind='Trust' AND a.active
 WHERE l.id=CASE WHEN d.deposit_holder='our_brokerage' THEN d.rv105_receipt_ledger_id ELSE d.rv108_commission_receipt_id END
 AND l.deal_id=d.id AND l.brokerage_id=d.brokerage_id AND l.amount>0 AND l.reverses_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.office_ledger x WHERE x.reverses_id=l.id);
 IF NOT FOUND OR r.amount IS DISTINCT FROM CASE WHEN d.deposit_holder='our_brokerage' THEN d.deposit_amount ELSE public.rv108_expected(d) END THEN RAISE EXCEPTION 'Full linked, unreversed Trust receipt required; review existing entries, do not repost'; END IF;
 RETURN r;
END; $$;
CREATE OR REPLACE FUNCTION public.rv108_guard_lawyer_release() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.rv108_lawyer_release_id IS NOT NULL OR NEW.rv108_commission_receipt_id IS NOT NULL OR NEW.rv108_general_credit_id IS NOT NULL THEN RAISE EXCEPTION 'Use the authorized accounting actions'; END IF;
 ELSE
  IF current_user IN ('authenticated','anon') AND ROW(NEW.rv108_lawyer_release_id,NEW.rv108_commission_receipt_id,NEW.rv108_general_credit_id) IS DISTINCT FROM ROW(OLD.rv108_lawyer_release_id,OLD.rv108_commission_receipt_id,OLD.rv108_general_credit_id) THEN RAISE EXCEPTION 'Use the authorized accounting actions'; END IF;
  IF (OLD.rv108_lawyer_release_id IS NOT NULL OR OLD.rv108_commission_receipt_id IS NOT NULL) AND ROW(NEW.representation,NEW.listing_commission,NEW.selling_commission,NEW.gst_rate,NEW.deposit_amount,NEW.deposit_holder) IS DISTINCT FROM ROW(OLD.representation,OLD.listing_commission,OLD.selling_commission,OLD.gst_rate,OLD.deposit_amount,OLD.deposit_holder) THEN RAISE EXCEPTION 'Settlement figures are locked; use audited accounting correction'; END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rv108_guard_lawyer_release ON public.deal_files;
CREATE TRIGGER rv108_guard_lawyer_release BEFORE INSERT OR UPDATE ON public.deal_files FOR EACH ROW EXECUTE FUNCTION public.rv108_guard_lawyer_release();
REVOKE ALL ON FUNCTION public.rv108_expected(public.deal_files),public.rv108_admin(uuid),public.rv108_receipt(public.deal_files) FROM PUBLIC,anon,authenticated;
COMMIT;
