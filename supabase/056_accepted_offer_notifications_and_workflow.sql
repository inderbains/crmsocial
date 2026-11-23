-- RealVolt 056 — accepted-offer status notification and simpler document review.
-- Requires the existing RealVolt SQL through 055. Back up the database and test on staging first.
-- Does not send external emails, mark money received, auto-verify documents, or issue payments.
BEGIN;

-- A listing MLS sheet remains available but is not mandatory. Accepted offers are
-- status changes, not a second compliance-review cycle.
UPDATE public.rv_compliance_templates
   SET required=false
 WHERE (kind='Listing' AND phase='listing' AND label='MLS listing sheet / listing details')
    OR (kind='Sale' AND phase='offer');

-- All firm-sale submissions require the sale report, regardless of which side we represent.
INSERT INTO public.rv_compliance_templates(brokerage_id,kind,phase,representation,label,required,active,sort_order)
SELECT b.id,'Sale','firm','selling','Sale report form',true,true,70 FROM public.brokerages b
ON CONFLICT (brokerage_id,kind,phase,representation,label) DO UPDATE
  SET required=true, active=true;

-- Keep that rule even when earlier seed functions run for future brokerages.
CREATE OR REPLACE FUNCTION public.rv056_nonmandatory_offer_template()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF (NEW.kind='Listing' AND NEW.phase='listing' AND NEW.label='MLS listing sheet / listing details')
     OR (NEW.kind='Sale' AND NEW.phase='offer') THEN
    NEW.required:=false;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rv056_nonmandatory_offer_template ON public.rv_compliance_templates;
CREATE TRIGGER rv056_nonmandatory_offer_template
BEFORE INSERT OR UPDATE ON public.rv_compliance_templates
FOR EACH ROW EXECUTE FUNCTION public.rv056_nonmandatory_offer_template();

-- Only update live files: preserve completed and archived compliance history.
UPDATE public.deal_requirements r
   SET rv_required=false
  FROM public.deal_files d
 WHERE r.deal_id=d.id
   AND d.rv_stage IS DISTINCT FROM 'Archived'
   AND d.rv_stage IS DISTINCT FROM 'Completed'
   AND ((d.kind='Listing' AND r.rv_phase='listing' AND r.label='MLS listing sheet / listing details')
     OR (d.kind='Sale' AND r.rv_phase='offer'));

-- A newly created linked sale marks the original listing Accepted Offer immediately,
-- even while the accepted offer is a Draft rather than a compliance submission.
CREATE OR REPLACE VIEW public.rv_tx_summary WITH (security_invoker=true) AS
SELECT d.id,d.user_id,d.brokerage_id,d.address,d.kind,d.review_status,d.rv_stage,
       d.parent_listing_id,d.rv_firm_date,d.rv_completed_date,
 CASE WHEN d.kind='Sale' THEN COALESCE(d.rv_stage,'Needs confirmation')
      WHEN s.id IS NOT NULL THEN CASE WHEN s.rv_stage IN ('Sold','Completed','Archived') THEN 'Sold' ELSE 'Accepted offer' END
      WHEN t.termination_date<=(now() at time zone 'America/Vancouver')::date
           THEN CASE WHEN d.review_status<>'Approved' THEN 'Termination pending' ELSE 'Terminated' END
      WHEN t.expiry_date<(now() at time zone 'America/Vancouver')::date THEN 'Expired'
      ELSE 'Active' END AS display_status,
 CASE WHEN d.kind='Listing' AND s.id IS NULL AND t.termination_date IS NULL
                AND t.expiry_date>=(now() at time zone 'America/Vancouver')::date THEN t.expiry_date
      WHEN d.kind='Sale' AND d.rv_stage='Accepted offer' THEN d.subject_date
      WHEN d.kind='Sale' AND d.rv_stage='Sold' THEN d.completion_date
      WHEN d.kind='Sale' AND d.rv_stage='Completed' AND d.possession_date>=(now() at time zone 'America/Vancouver')::date THEN d.possession_date
      ELSE NULL END AS next_date
FROM public.deal_files d
LEFT JOIN public.listing_terms t ON t.deal_id=d.id
LEFT JOIN public.deal_files s ON s.parent_listing_id=d.id AND s.rv_stage IS DISTINCT FROM 'Collapsed';
GRANT SELECT ON public.rv_tx_summary TO authenticated;

-- The old stage guard required an Accepted Offer to be approved before subjects
-- could be removed; now firm-sale document submission is the first sale review.
-- The post-firm Back Office approval guard (055) remains enabled.
DROP TRIGGER IF EXISTS rv055_stage_guard ON public.deal_files;

CREATE OR REPLACE FUNCTION public.rv056_notify_new_accepted_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.kind='Sale' AND NEW.rv_stage='Accepted offer' AND NEW.brokerage_id IS NOT NULL THEN
    PERFORM public.rv_tx_notice(NEW,'office','Accepted offer recorded — '||left(coalesce(NEW.address,'Transaction'),150));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rv056_notify_new_accepted_offer ON public.deal_files;
CREATE TRIGGER rv056_notify_new_accepted_offer
AFTER INSERT ON public.deal_files
FOR EACH ROW EXECUTE FUNCTION public.rv056_notify_new_accepted_offer();

-- Conditional-offer extensions and collapses are status notifications, not
-- compliance submissions. Verify file ownership and signed-document ownership.
CREATE OR REPLACE FUNCTION public.rv056_offer_update(
  p_deal uuid,
  p_action text,
  p_date date DEFAULT NULL,
  p_document uuid DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  d public.deal_files;
  v_doc public.deal_documents;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
  IF NOT FOUND OR d.brokerage_id IS DISTINCT FROM public.current_brokerage()
     OR d.user_id IS DISTINCT FROM auth.uid()
     OR d.kind<>'Sale' OR d.rv_stage IS DISTINCT FROM 'Accepted offer'
     OR d.review_status NOT IN ('Draft','Changes requested','Approved') THEN
    RAISE EXCEPTION 'Only the assigned Realtor can update a conditional accepted offer';
  END IF;
  IF p_action NOT IN ('extend_subject','collapse') THEN
    RAISE EXCEPTION 'Unknown accepted-offer status update';
  END IF;
  IF p_action='extend_subject' THEN
    IF p_date IS NULL OR p_date<=coalesce(d.subject_date,d.contract_date)
       OR (d.completion_date IS NOT NULL AND p_date>d.completion_date) THEN
      RAISE EXCEPTION 'Enter a later subject-removal date, no later than completion';
    END IF;
    IF p_document IS NULL THEN RAISE EXCEPTION 'Attach the signed extension PDF'; END IF;
    SELECT * INTO v_doc FROM public.deal_documents WHERE id=p_document AND deal_id=p_deal;
    IF NOT FOUND OR lower(v_doc.name) NOT LIKE '%.pdf' OR
       NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='transaction-files' AND o.name=v_doc.path) THEN
      RAISE EXCEPTION 'Choose a signed extension PDF from this transaction';
    END IF;
  END IF;
  PERFORM set_config('realvolt.lifecycle_rpc','yes',true);
  IF p_action='extend_subject' THEN
    UPDATE public.deal_files SET subject_date=p_date WHERE id=p_deal;
    INSERT INTO public.transaction_audit_events(deal_id,actor_id,action,new_values)
    VALUES(p_deal,auth.uid(),'Accepted offer — subject extension status updated',
      jsonb_build_object('subject_date',p_date,'extension_document_id',p_document));
    PERFORM public.rv_tx_notice(d,'office','Accepted offer — subject date extended (status notification only)');
  ELSE
    UPDATE public.deal_files SET rv_stage='Collapsed' WHERE id=p_deal;
    INSERT INTO public.transaction_audit_events(deal_id,actor_id,action,new_values)
    VALUES(p_deal,auth.uid(),'Accepted offer collapsed',
      jsonb_build_object('stage','Collapsed','linked_listing_returns_active',true));
    PERFORM public.rv_tx_notice(d,'office','Offer collapsed — linked listing active again');
  END IF;
  PERFORM set_config('realvolt.lifecycle_rpc','no',true);
END $$;
REVOKE ALL ON FUNCTION public.rv056_offer_update(uuid,text,date,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv056_offer_update(uuid,text,date,uuid) TO authenticated;
-- Keep the required firm-sale report on new brokerages as well.
CREATE OR REPLACE FUNCTION public.rv056_seed_firm_sale_report()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.rv_compliance_templates
    (brokerage_id,kind,phase,representation,label,required,active,sort_order)
  VALUES (NEW.id,'Sale','firm','selling','Sale report form',true,true,70)
  ON CONFLICT (brokerage_id,kind,phase,representation,label)
  DO UPDATE SET required=true,active=true;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rv056_seed_firm_sale_report ON public.brokerages;
CREATE TRIGGER rv056_seed_firm_sale_report AFTER INSERT ON public.brokerages
FOR EACH ROW EXECUTE FUNCTION public.rv056_seed_firm_sale_report();

COMMIT;
