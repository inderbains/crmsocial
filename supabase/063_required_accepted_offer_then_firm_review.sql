-- RealVolt Fix 063: Accepted-offer documents are mandatory to become firm,
-- but the accepted-offer stage does NOT require Back Office approval.
-- The same saved files are reviewed along with firm-sale documents after subjects removed.
-- Prerequisites: migrations 044, 046, 055, 056, 059 and the applicable category repair (062).
-- Run once on staging first, after a backup. No funds or signatures are changed.
BEGIN;

-- Replace the old 056 blanket "all offer forms optional" rule. Keep MLS sheet
-- and addenda optional. The compliance review still happens at the firm stage.
CREATE OR REPLACE FUNCTION public.rv056_nonmandatory_offer_template()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.kind='Listing' AND NEW.phase='listing'
     AND NEW.label='MLS listing sheet / listing details' THEN
    NEW.required:=false;
  ELSIF NEW.kind='Sale' AND NEW.phase='offer' THEN
    NEW.required:=NEW.label IN (
      'Signed purchase and sale contract',
      'Commission disclosure',
      'Disclosure of services / representation',
      'FINTRAC identity verification — buyer(s)',
      'FINTRAC identity verification — seller(s)'
    );
  END IF;
  RETURN NEW;
END $$;

-- Supply the appropriate forms for each transaction side, including brokerages
-- which had older, incomplete templates. Each ID category can hold additional IDs.
INSERT INTO public.rv_compliance_templates
  (brokerage_id,kind,phase,representation,label,required,active,sort_order)
SELECT b.id,'Sale','offer',v.representation,v.label,v.required,true,v.sort_order
FROM public.brokerages b
CROSS JOIN (VALUES
  ('any','Signed purchase and sale contract',true,10),
  ('listing','Commission disclosure',true,20),
  ('selling','Commission disclosure',true,20),
  ('listing','Disclosure of services / representation',true,30),
  ('selling','Disclosure of services / representation',true,30),
  ('listing','FINTRAC identity verification — seller(s)',true,40),
  ('selling','FINTRAC identity verification — buyer(s)',true,40),
  ('any','Contract addendum (if applicable)',false,50)
) AS v(representation,label,required,sort_order)
ON CONFLICT(brokerage_id,kind,phase,representation,label)
DO UPDATE SET required=EXCLUDED.required,active=true,sort_order=EXCLUDED.sort_order;

-- No premature approval. Keep existing approved / archived history unchanged,
-- but synchronize the checklist on open conditional and submitted firm files.
SELECT public.rv_seed_deal_compliance(d.id)
FROM public.deal_files d
WHERE d.kind='Sale' AND d.brokerage_id IS NOT NULL
  AND (d.rv_stage='Accepted offer' OR (d.rv_stage='Sold' AND d.review_status='Submitted'));

-- Other brokerages' admins must be able to VIEW the conditional sale immediately
-- after it is recorded, even while review_status is Draft. Other draft files stay private.
DROP POLICY IF EXISTS deal_read ON public.deal_files;
CREATE POLICY deal_read ON public.deal_files FOR SELECT TO authenticated USING (
 (user_id=auth.uid() AND (brokerage_id IS NULL OR brokerage_id=public.current_brokerage()))
 OR (brokerage_id=public.current_brokerage()
     AND public.can_review_deal(user_id)
     AND (review_status<>'Draft' OR (kind='Sale' AND rv_stage='Accepted offer')))
);

-- A new named custom attachment (uploaded with "Add another document") is an
-- OPTIONAL review item. Uploaded files never become verified automatically.
CREATE OR REPLACE FUNCTION public.rv063_register_named_attachment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deal_files; phase text; label_for_doc text;
BEGIN
 IF position(' — ' in NEW.name)=0 OR split_part(NEW.path,'/',4)<>'' THEN RETURN NEW; END IF;
 SELECT * INTO d FROM public.deal_files WHERE id=NEW.deal_id;
 IF NOT FOUND OR d.rv_stage IN ('Archived','Collapsed') THEN RETURN NEW; END IF;
 phase:=CASE WHEN d.kind='Listing' THEN 'listing'
             WHEN d.rv_stage IN ('Sold','Completed') THEN 'firm'
             ELSE 'offer' END;
 label_for_doc:='Additional document: '||left(NEW.name,175)||' — '||left(NEW.id::text,8);
 INSERT INTO public.deal_requirements(deal_id,label,document_id,verified,rv_phase,rv_required)
 VALUES(NEW.deal_id,label_for_doc,NEW.id,false,phase,false)
 ON CONFLICT(deal_id,label) DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rv063_register_named_attachment ON public.deal_documents;
CREATE TRIGGER rv063_register_named_attachment
AFTER INSERT ON public.deal_documents
FOR EACH ROW EXECUTE FUNCTION public.rv063_register_named_attachment();

-- Once every mandatory Accepted Offer document is linked, send one informational
-- notification. The agent can continue without admin approval; the same requirements
-- remain unchecked until the post-subject-removal Back Office review.
CREATE OR REPLACE FUNCTION public.rv063_offer_documents_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deal_files;
BEGIN
 IF NEW.rv_phase<>'offer' OR NOT NEW.rv_required OR NEW.document_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO d FROM public.deal_files WHERE id=NEW.deal_id;
 IF NOT FOUND OR d.kind<>'Sale' OR d.rv_stage IS DISTINCT FROM 'Accepted offer' THEN RETURN NEW; END IF;
 IF EXISTS (
   SELECT 1 FROM public.rv_compliance_templates t
   LEFT JOIN public.deal_requirements r ON r.deal_id=d.id AND r.label=t.label
   WHERE t.brokerage_id=d.brokerage_id AND t.kind='Sale' AND t.phase='offer'
     AND t.active AND t.required
     AND (t.representation='any' OR t.representation=d.representation)
     AND r.document_id IS NULL
 ) THEN RETURN NEW; END IF;
 IF NOT EXISTS (
   SELECT 1 FROM public.rv_transaction_notifications n
   WHERE n.deal_id=d.id AND n.message='Accepted offer documents complete — pending firm sale'
 ) THEN
   PERFORM public.rv_tx_notice(d,'office','Accepted offer documents complete — pending firm sale');
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rv063_offer_documents_complete ON public.deal_requirements;
CREATE TRIGGER rv063_offer_documents_complete
AFTER INSERT OR UPDATE OF document_id ON public.deal_requirements
FOR EACH ROW EXECUTE FUNCTION public.rv063_offer_documents_complete();

-- This is a DOCUMENT presence guard, not a requirement for approval/verification.
-- It applies only when moving an accepted offer to firm / sold status.
CREATE OR REPLACE FUNCTION public.rv063_offer_docs_before_firm()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE missing text;
BEGIN
 IF NEW.kind<>'Sale' OR NEW.rv_stage IS DISTINCT FROM 'Sold'
    OR OLD.rv_stage IS DISTINCT FROM 'Accepted offer' THEN RETURN NEW; END IF;
 SELECT string_agg(t.label, ', ' ORDER BY t.sort_order,t.label) INTO missing
 FROM public.rv_compliance_templates t
 LEFT JOIN public.deal_requirements r ON r.deal_id=OLD.id AND r.label=t.label
 WHERE t.brokerage_id=OLD.brokerage_id AND t.kind='Sale'
   AND t.phase='offer' AND t.active AND t.required
   AND (t.representation='any' OR t.representation=OLD.representation)
   AND r.document_id IS NULL;
 IF missing IS NOT NULL THEN
   RAISE EXCEPTION 'Upload Accepted Offer documents before firm sale: %', missing;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rv063_offer_docs_before_firm ON public.deal_files;
CREATE TRIGGER rv063_offer_docs_before_firm
BEFORE UPDATE OF rv_stage ON public.deal_files
FOR EACH ROW EXECUTE FUNCTION public.rv063_offer_docs_before_firm();

COMMIT;
