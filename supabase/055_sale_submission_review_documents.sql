-- RealVolt 055: Restore the accepted-offer -> firm-sale document/approval workflow.
-- Requires 044, 046, 047, 048, 049, 050 already installed. Backup and test on staging.
-- Does not auto-approve forms, send email, disburse trust funds, or issue cheques.
BEGIN;

-- Apply the same firm/offer document expectations to existing and future brokerages.
CREATE OR REPLACE FUNCTION public.rv055_seed_brokerage(p_brokerage uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  -- MLS sheet remains available, but is not one of the owner's three required listing uploads.
  UPDATE public.rv_compliance_templates
    SET required=false
    WHERE brokerage_id=p_brokerage AND kind='Listing' AND phase='listing'
    AND label='MLS listing sheet / listing details';

  INSERT INTO public.rv_compliance_templates
    (brokerage_id,kind,phase,representation,label,required,active,sort_order)
  SELECT p_brokerage,v.kind,v.phase,v.representation,v.label,v.required,true,v.sort_order
  FROM (VALUES
    ('Listing','listing','any','Signed listing contract',true,10),
    ('Listing','listing','any','Disclosure (listing)',true,20),
    ('Listing','listing','any','FINTRAC identity verification',true,30),
    ('Listing','listing','any','Listing addendum (if applicable)',false,40),
    ('Sale','offer','any','Signed purchase and sale contract',true,10),
    ('Sale','offer','listing','Commission disclosure',true,20),
    ('Sale','offer','selling','Commission disclosure',true,20),
    ('Sale','offer','listing','Disclosure of services / representation',true,30),
    ('Sale','offer','selling','Disclosure of services / representation',true,30),
    ('Sale','offer','listing','FINTRAC identity verification — seller(s)',true,40),
    ('Sale','offer','selling','FINTRAC identity verification — buyer(s)',true,40),
    ('Sale','offer','any','Contract addendum (if applicable)',false,50),
    ('Sale','firm','any','Signed subject removal / unconditional contract',true,10),
    ('Sale','firm','any','Title search',true,20),
    ('Sale','firm','any','Property Disclosure Statement (PDS)',true,30),
    ('Sale','firm','any','Deposit cheque copy / deposit receipt',true,40),
    ('Sale','firm','listing','Trade record sheet',true,50),
    ('Sale','firm','selling','Trade record sheet',true,50),
    ('Sale','firm','listing','Receipt of funds',true,60),
    ('Sale','firm','selling','Receipt of funds',true,60),
    ('Sale','firm','listing','Sale report form',true,70),
    ('Sale','firm','any','Subject extension or other addendum (if applicable)',false,90)
  ) AS v(kind,phase,representation,label,required,sort_order)
  ON CONFLICT(brokerage_id,kind,phase,representation,label)
  DO UPDATE SET required=EXCLUDED.required,active=true;
END $$;
REVOKE ALL ON FUNCTION public.rv055_seed_brokerage(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.rv055_brokerage_insert_hook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.rv055_seed_brokerage(NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rv055_seed_new_brokerage ON public.brokerages;
CREATE TRIGGER rv055_seed_new_brokerage AFTER INSERT ON public.brokerages
FOR EACH ROW EXECUTE FUNCTION public.rv055_brokerage_insert_hook();

SELECT public.rv055_seed_brokerage(b.id) FROM public.brokerages b;
-- Seed only files currently awaiting preparation/review. Do not rewrite archived/approved history.
SELECT public.rv_seed_deal_compliance(d.id)
FROM public.deal_files d
WHERE d.brokerage_id IS NOT NULL AND d.review_status IN ('Draft','Changes requested','Submitted')
  AND (d.rv_stage IS NULL OR d.rv_stage NOT IN ('Archived','Collapsed','Completed'));

-- One verified identity file satisfies the required line; all additional IDs are
-- independently linked (optional rows) and can be reviewed without replacing it.
CREATE OR REPLACE FUNCTION public.rv055_link_extra_identity_doc(
 p_deal uuid,p_document uuid,p_template_label text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  d public.deal_files;
  f public.deal_documents;
  t public.rv_compliance_templates;
  result_id uuid;
  identity_label text;
  reviewer boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
  IF NOT FOUND OR d.brokerage_id IS NULL
    OR d.brokerage_id IS DISTINCT FROM public.current_brokerage()
    OR d.rv_stage IN ('Archived','Collapsed') THEN
      RAISE EXCEPTION 'Transaction is unavailable';
  END IF;
  reviewer:=public.can_review_deal(d.user_id);
  IF NOT ((d.user_id=auth.uid() AND d.review_status IN ('Draft','Approved','Changes requested'))
    OR (reviewer AND d.review_status IN ('Submitted','Approved','Changes requested'))) THEN
    RAISE EXCEPTION 'This transaction is locked for review';
  END IF;
  IF p_template_label NOT LIKE 'FINTRAC identity verification%' THEN
    RAISE EXCEPTION 'Only identity verification documents can use this action';
  END IF;
  SELECT * INTO t FROM public.rv_compliance_templates
    WHERE brokerage_id=d.brokerage_id AND kind=d.kind AND active
      AND label=p_template_label AND phase=CASE WHEN d.kind='Listing' THEN 'listing' ELSE 'offer' END
      AND (representation='any' OR representation=d.representation)
    LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Identity document category is unavailable'; END IF;
  SELECT * INTO f FROM public.deal_documents WHERE id=p_document AND deal_id=d.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Identity document must belong to this transaction'; END IF;
  IF NOT reviewer AND split_part(f.path,'/',1)<>auth.uid()::text THEN
    RAISE EXCEPTION 'Only your own uploads may be linked';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects o
    WHERE o.bucket_id='transaction-files' AND o.name=f.path) THEN
    RAISE EXCEPTION 'Identity document not found in private storage';
  END IF;
  identity_label:=left(t.label,150)||' — additional '||left(f.id::text,8)||' — '||left(f.name,40);
  INSERT INTO public.deal_requirements(deal_id,label,document_id,verified,rv_phase,rv_required)
  VALUES(d.id,identity_label,f.id,false,t.phase,true)
  ON CONFLICT(deal_id,label) DO UPDATE SET document_id=EXCLUDED.document_id
  RETURNING id INTO result_id;
  RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.rv055_link_extra_identity_doc(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv055_link_extra_identity_doc(uuid,uuid,text) TO authenticated;

-- The accepted-offer stage must be submitted and reviewed before advancing
-- to either subject removal or direct unconditional firm sale.
CREATE OR REPLACE FUNCTION public.rv055_stage_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.kind='Sale' AND NEW.rv_stage='Sold'
    AND COALESCE(OLD.rv_stage,'Accepted offer')='Accepted offer'
    AND OLD.review_status IS DISTINCT FROM 'Approved' THEN
      RAISE EXCEPTION 'Back Office must approve the accepted offer before the sale can become firm';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rv055_stage_guard ON public.deal_files;
CREATE TRIGGER rv055_stage_guard BEFORE UPDATE OF rv_stage ON public.deal_files
FOR EACH ROW EXECUTE FUNCTION public.rv055_stage_guard();

-- Prevent any UI or API client from approving a firm sale without the saved
-- lawyer + commission + GST + deposit confirmation, even if documents are verified.
CREATE OR REPLACE FUNCTION public.rv055_firm_approval_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.kind='Sale' AND NEW.rv_stage='Sold' AND NEW.review_status='Approved'
    AND OLD.review_status IS DISTINCT FROM 'Approved'
    AND NOT COALESCE(NEW.rv_post_firm_details_confirmed,false) THEN
      RAISE EXCEPTION 'Save both lawyers, commission, GST and deposit details before approving firm sale';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rv055_firm_approval_guard ON public.deal_files;
CREATE TRIGGER rv055_firm_approval_guard BEFORE UPDATE OF review_status ON public.deal_files
FOR EACH ROW EXECUTE FUNCTION public.rv055_firm_approval_guard();

COMMIT;
