-- OPTIONAL TARGETED HARDENING (REVIEW AND TEST IN STAGING FIRST)
-- Not required to run the inventory or tenant-link checks.
-- Prevents authenticated SignVolt draft creation/relinking with forged brokerage/deal associations.
-- Based on source tables from 004, 005, 009, 012; verify the deployed schema before applying.
-- This does not rewrite historical records. May change permitted deal-linking workflows.
BEGIN;
CREATE OR REPLACE FUNCTION public.rv_guard_sign_envelope_links()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_deal_owner uuid;
  v_deal_brokerage uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'SignVolt owner cannot be changed';
  END IF;
  IF NEW.brokerage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.brokerage_members m
    WHERE m.user_id = NEW.user_id AND m.brokerage_id = NEW.brokerage_id
  ) THEN
    RAISE EXCEPTION 'SignVolt brokerage does not match owner membership';
  END IF;
  IF NEW.deal_id IS NOT NULL THEN
    SELECT d.user_id,d.brokerage_id
      INTO v_deal_owner,v_deal_brokerage
      FROM public.deal_files d WHERE d.id = NEW.deal_id;
    IF NOT FOUND OR v_deal_owner IS DISTINCT FROM NEW.user_id THEN
      RAISE EXCEPTION 'SignVolt deal must belong to its owner';
    END IF;
    IF NEW.brokerage_id IS NOT NULL AND
       v_deal_brokerage IS DISTINCT FROM NEW.brokerage_id THEN
      RAISE EXCEPTION 'SignVolt deal and envelope brokerages differ';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rv_guard_sign_envelope_links() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS rv_guard_sign_envelope_links ON public.sign_envelopes;
CREATE TRIGGER rv_guard_sign_envelope_links
BEFORE INSERT OR UPDATE OF user_id,brokerage_id,deal_id
ON public.sign_envelopes
FOR EACH ROW EXECUTE FUNCTION public.rv_guard_sign_envelope_links();
COMMIT;
-- IMPORTANT: this guard validates references but is NOT a complete subscription, RLS, or API-security system.
-- Test: own draft with null brokerage, own deal linking, a different-agent deal,
-- a different-brokerage ID, an admin-owned deal and historical agents transferring brokerages.
