-- RealVolt Fix 072: testing-ready payout and optional internally generated PDFs.
-- Run only after verifying Fix 044 / 070 / 071 on staging.
-- This does NOT change GST registration, invent deposits, or issue payments.
BEGIN;
UPDATE public.rv_compliance_templates SET required=false
 WHERE kind='Sale' AND lower(label) IN (
  'brokerage completion confirmation (pdf)',
  'commission instruction report — cir (pdf)',
  'internal commission payable statement (pdf)'
 );
UPDATE public.deal_requirements SET rv_required=false
 WHERE rv_phase='completion' AND lower(label) IN (
  'brokerage completion confirmation (pdf)',
  'commission instruction report — cir (pdf)',
  'internal commission payable statement (pdf)'
 );
-- Keep the three internal PDFs optional if a brokerage/template is reseeded.
CREATE OR REPLACE FUNCTION public.rv072_optional_internal_template() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.kind='Sale' AND lower(NEW.label) IN ('brokerage completion confirmation (pdf)','commission instruction report — cir (pdf)','internal commission payable statement (pdf)') THEN NEW.required=false;END IF;
 RETURN NEW;END $$;
DROP TRIGGER IF EXISTS rv072_optional_internal_template ON public.rv_compliance_templates;
CREATE TRIGGER rv072_optional_internal_template BEFORE INSERT OR UPDATE ON public.rv_compliance_templates
 FOR EACH ROW EXECUTE FUNCTION public.rv072_optional_internal_template();
CREATE OR REPLACE FUNCTION public.rv072_optional_internal_requirement() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.rv_phase='completion' AND lower(NEW.label) IN ('brokerage completion confirmation (pdf)','commission instruction report — cir (pdf)','internal commission payable statement (pdf)') THEN NEW.rv_required=false;END IF;
 RETURN NEW;END $$;
DROP TRIGGER IF EXISTS rv072_optional_internal_requirement ON public.deal_requirements;
CREATE TRIGGER rv072_optional_internal_requirement BEFORE INSERT OR UPDATE ON public.deal_requirements
 FOR EACH ROW EXECUTE FUNCTION public.rv072_optional_internal_requirement();
-- Preserve all other mandatory checks and the paid-payout requirement.
CREATE OR REPLACE FUNCTION public.rv_compliance_archive_guard() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.rv_stage='Archived' AND OLD.rv_stage IS DISTINCT FROM 'Archived' AND NEW.kind='Sale' THEN
  IF EXISTS(SELECT 1 FROM public.deal_requirements r WHERE r.deal_id=NEW.id AND r.rv_required
     AND NOT r.rv_waived AND (NOT r.verified OR r.document_id IS NULL)) THEN
    RAISE EXCEPTION 'Resolve required compliance documents before archiving';END IF;
 END IF;RETURN NEW;END $$;

CREATE OR REPLACE FUNCTION public.rv_close_compliant_file(p_deal uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
 DECLARE d public.deal_files; v_manifest jsonb; BEGIN
 SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR d.brokerage_id IS DISTINCT FROM public.current_brokerage()
    OR NOT public.can_review_deal(d.user_id) THEN RAISE EXCEPTION 'Authorized brokerage reviewer required';END IF;
 IF d.kind<>'Sale' OR d.rv_stage<>'Completed' OR d.review_status<>'Approved'
    OR d.rv_completed_date IS NULL OR d.rv_completion_letter IS NULL OR NOT d.rv_funds_verified THEN
    RAISE EXCEPTION 'Complete the legal transaction, commission receipt and lawyer letter first';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_payouts WHERE deal_id=p_deal AND status='Paid') THEN
    RAISE EXCEPTION 'Record the authorized agent payment before closing';END IF;
 PERFORM public.rv_seed_deal_compliance(p_deal);
 IF EXISTS(SELECT 1 FROM public.deal_requirements r WHERE r.deal_id=p_deal AND r.rv_required
  AND NOT r.rv_waived AND (NOT r.verified OR r.document_id IS NULL)) THEN
    RAISE EXCEPTION 'Required compliance documents are missing or unverified';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'path',x.path,
    'phase',coalesce(r.rv_phase,'other'),'verified',coalesce(r.verified,false),
    'label',r.label) ORDER BY x.created_at,x.id),'[]'::jsonb) INTO v_manifest
 FROM public.deal_documents x LEFT JOIN LATERAL (
   SELECT q.rv_phase,q.verified,q.label FROM public.deal_requirements q
   WHERE q.deal_id=p_deal AND q.document_id=x.id ORDER BY q.rv_phase LIMIT 1
 ) r ON true WHERE x.deal_id=p_deal;
 IF v_manifest='[]'::jsonb THEN RAISE EXCEPTION 'Cannot archive an empty transaction folder';END IF;
 PERFORM set_config('realvolt.lifecycle_rpc','yes',true);
 UPDATE public.deal_files SET rv_stage='Archived' WHERE id=p_deal;
 INSERT INTO public.rv_closed_file_folders(deal_id,brokerage_id,folder_prefix,document_manifest,closed_by)
 VALUES(d.id,d.brokerage_id,d.user_id::text||'/'||d.id::text||'/',v_manifest,auth.uid()) ON CONFLICT(deal_id) DO NOTHING;
 INSERT INTO public.transaction_audit_events(deal_id,actor_id,action,new_values)
 VALUES(d.id,auth.uid(),'Compliance file closed',jsonb_build_object('document_count',jsonb_array_length(v_manifest)));
 PERFORM public.rv_tx_notice(d,'agent','File closed and archived');
 END $$;


-- Atomic receipt posting for commission received when a different brokerage held deposit.
-- Uses the existing permission-checked accounting entry function, not a new ledger.
CREATE OR REPLACE FUNCTION public.rv072_receive_commission_funds(
 p_deal uuid,p_account uuid,p_amount numeric,p_day date,p_reference text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deal_files;a public.office_bank_accounts;posted uuid;
BEGIN
 SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_brokerage_admin(d.brokerage_id)
    OR d.kind<>'Sale' OR d.rv_stage<>'Completed' OR d.review_status<>'Approved'
    OR d.deposit_holder<>'other_brokerage' OR d.rv_completion_letter IS NULL THEN
    RAISE EXCEPTION 'Completed sale and authorized brokerage admin required';
 END IF;
 IF d.rv_funds_verified THEN RAISE EXCEPTION 'Commission receipt is already confirmed for this file';END IF;
 SELECT * INTO a FROM public.office_bank_accounts WHERE id=p_account FOR UPDATE;
 IF NOT FOUND OR a.brokerage_id IS DISTINCT FROM d.brokerage_id OR a.kind<>'Operating' THEN
    RAISE EXCEPTION 'Choose this brokerage operating account';END IF;
 IF round(p_amount,2) IS DISTINCT FROM round(
  coalesce(CASE WHEN d.representation='listing' THEN d.listing_commission ELSE d.selling_commission END,0)
  * (1+coalesce(d.gst_rate,5)/100),2) THEN
  RAISE EXCEPTION 'Commission funds received differ from the saved represented-side commission plus GST. Resolve the difference in the transaction before verifying';
 END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_day IS NULL OR p_day>(now() at time zone 'America/Vancouver')::date
    OR length(btrim(coalesce(p_reference,'')))<4 THEN RAISE EXCEPTION 'Actual amount, deposit date and bank reference required';END IF;
 IF EXISTS(SELECT 1 FROM public.office_ledger l WHERE l.deal_id=p_deal AND l.account_id=p_account
           AND l.reference=btrim(p_reference) AND l.amount=round(p_amount,2)) THEN
    RAISE EXCEPTION 'Matching commission receipt already exists in the operating ledger';END IF;
 posted:=public.post_office_entry(p_account,p_deal,p_day,'Commission receipt — external deposit holder',p_amount,btrim(p_reference),null);
 PERFORM public.rv_tx_action(p_deal,'funds',null,null,'Operating bank receipt '||p_reference||', CAD '||round(p_amount,2)::text);
 RETURN posted;
END $$;
REVOKE ALL ON FUNCTION public.rv072_receive_commission_funds(uuid,uuid,numeric,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv072_receive_commission_funds(uuid,uuid,numeric,date,text) TO authenticated;

COMMIT;
