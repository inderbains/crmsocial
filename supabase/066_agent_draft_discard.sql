-- RealVolt Fix 066: safely discard an agent's own, never-submitted draft.
-- This is a SOFT DELETE. Documents and original financial/audit data are retained.
-- Run in Supabase SQL Editor after testing on staging / taking a backup.
BEGIN;
ALTER TABLE public.deal_files
  ADD COLUMN IF NOT EXISTS rv_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rv_deleted_by uuid;

-- Reject direct updates to the discard columns. Only the protected RPC may change them.
CREATE OR REPLACE FUNCTION public.rv_guard_draft_discard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $guard$
BEGIN
  IF OLD.rv_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Discarded drafts are read-only';
  END IF;
  IF NEW.rv_deleted_at IS DISTINCT FROM OLD.rv_deleted_at
     OR NEW.rv_deleted_by IS DISTINCT FROM OLD.rv_deleted_by THEN
    IF current_user IN ('authenticated','anon')
       OR current_setting('realvolt.draft_discard_rpc',true) IS DISTINCT FROM 'yes' THEN
      RAISE EXCEPTION 'Use the Delete draft action';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;
DROP TRIGGER IF EXISTS rv_guard_draft_discard_trigger ON public.deal_files;
CREATE TRIGGER rv_guard_draft_discard_trigger
BEFORE UPDATE ON public.deal_files
FOR EACH ROW EXECUTE FUNCTION public.rv_guard_draft_discard();

CREATE OR REPLACE FUNCTION public.rv_discard_draft_transaction(p_deal uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $discard$
DECLARE
  d public.deal_files%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;
  SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
  IF NOT FOUND OR d.user_id IS DISTINCT FROM auth.uid()
     OR d.brokerage_id IS DISTINCT FROM public.current_brokerage() THEN
    RAISE EXCEPTION 'Draft is not available to this agent';
  END IF;
  IF d.rv_deleted_at IS NOT NULL OR d.review_status <> 'Draft'
     OR COALESCE(d.rv_stage,'Accepted offer') NOT IN ('Accepted offer')
     OR d.rv_firm_date IS NOT NULL OR d.rv_completed_date IS NOT NULL
     OR COALESCE(d.rv_funds_verified,false) THEN
    RAISE EXCEPTION 'Only an unsubmitted draft can be deleted';
  END IF;
  -- A linked or previously communicated sale is part of the brokerage record.
  IF d.parent_listing_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.deal_files c WHERE c.parent_listing_id=d.id)
     OR EXISTS (SELECT 1 FROM public.rv_transaction_notifications n WHERE n.deal_id=d.id)
     OR EXISTS (SELECT 1 FROM public.agent_payouts p WHERE p.deal_id=d.id)
     OR EXISTS (SELECT 1 FROM public.office_cheques c WHERE c.deal_id=d.id)
  THEN
    RAISE EXCEPTION 'This file has linked activity; request Back Office assistance instead';
  END IF;
  PERFORM set_config('realvolt.draft_discard_rpc','yes',true);
  UPDATE public.deal_files
     SET rv_deleted_at=now(),rv_deleted_by=auth.uid()
   WHERE id=p_deal;
END;
$discard$;
REVOKE ALL ON FUNCTION public.rv_discard_draft_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rv_discard_draft_transaction(uuid) TO authenticated;
COMMIT;
