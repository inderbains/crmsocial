-- RealVolt Fix 070: legal completion follows the CIR/lawyer email stage.
-- Run only after backing up Supabase and testing in staging.
-- The email provider's accepted status does not guarantee inbox delivery.
CREATE OR REPLACE FUNCTION public.rv070_require_cir_before_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.rv_stage = 'Sold' AND NEW.rv_stage = 'Completed' AND NOT EXISTS (
    SELECT 1 FROM public.closing_deliveries AS c
     WHERE c.deal_id = NEW.id
       AND c.brokerage_id = NEW.brokerage_id
       AND c.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'Send the CIR and lawyer email before confirming legal completion';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS rv070_completion_after_cir ON public.deal_files;
CREATE TRIGGER rv070_completion_after_cir
BEFORE UPDATE OF rv_stage ON public.deal_files
FOR EACH ROW EXECUTE FUNCTION public.rv070_require_cir_before_completion();
