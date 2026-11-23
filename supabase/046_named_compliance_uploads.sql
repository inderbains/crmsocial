-- RealVolt 046: Stage-specific uploads and safe document linkage.
-- Requires SQL 044. Run in staging, backup first, then deploy application files.
BEGIN;

-- Owner may add missing/extended forms to their own open deal after initial approval.
-- Assigned Back Office reviewers may attach forms to submitted/approved files.
-- No uploads to archived or collapsed sales. No overwrite of existing storage files.
DROP POLICY IF EXISTS document_insert ON public.deal_documents;
CREATE POLICY document_insert ON public.deal_documents FOR INSERT TO authenticated
WITH CHECK (
 EXISTS (
  SELECT 1 FROM public.deal_files d
  WHERE d.id=deal_id AND d.brokerage_id=public.current_brokerage()
    AND coalesce(d.rv_stage,'') NOT IN ('Archived','Collapsed')
    AND path LIKE auth.uid()::text||'/'||d.id::text||'/%'
    AND (
      (d.user_id=auth.uid() AND d.review_status IN ('Draft','Changes requested','Approved'))
      OR (public.can_review_deal(d.user_id) AND d.review_status IN ('Submitted','Approved','Changes requested'))
    )
 )
);
DROP POLICY IF EXISTS transaction_upload ON storage.objects;
CREATE POLICY transaction_upload ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
 bucket_id='transaction-files'
 AND EXISTS (
  SELECT 1 FROM public.deal_files d
  WHERE d.brokerage_id=public.current_brokerage()
    AND name LIKE auth.uid()::text||'/'||d.id::text||'/%'
    AND coalesce(d.rv_stage,'') NOT IN ('Archived','Collapsed')
    AND (
      (d.user_id=auth.uid() AND d.review_status IN ('Draft','Changes requested','Approved'))
      OR (public.can_review_deal(d.user_id) AND d.review_status IN ('Submitted','Approved','Changes requested'))
    )
 )
);

-- Only the brokerage's actual templates may be used as upload labels; clients cannot
-- create fake mandatory documents or mark something verified or waived.
CREATE OR REPLACE FUNCTION public.rv_link_uploaded_compliance_doc(
 p_deal uuid,p_document uuid,p_template_label text,p_additional boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 d public.deal_files; f public.deal_documents; t public.rv_compliance_templates;
 r public.deal_requirements; is_owner boolean; is_reviewer boolean;
 label_to_save text; result_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required';END IF;
 SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND OR d.brokerage_id IS NULL OR d.brokerage_id IS DISTINCT FROM public.current_brokerage()
   OR coalesce(d.rv_stage,'') IN ('Archived','Collapsed') THEN RAISE EXCEPTION 'Transaction unavailable';END IF;
 is_owner:=(d.user_id=auth.uid());
 is_reviewer:=public.can_review_deal(d.user_id);
 IF NOT (
   (is_owner AND d.review_status IN ('Draft','Changes requested','Approved'))
   OR (is_reviewer AND d.review_status IN ('Submitted','Approved','Changes requested'))
 ) THEN RAISE EXCEPTION 'This file is locked for changes';END IF;
 SELECT * INTO t FROM public.rv_compliance_templates
  WHERE brokerage_id=d.brokerage_id AND kind=d.kind AND label=p_template_label AND active
   AND (representation='any' OR representation=d.representation)
  ORDER BY CASE WHEN representation=d.representation THEN 0 ELSE 1 END LIMIT 1;
 IF NOT FOUND OR (t.phase='listing' AND d.kind<>'Listing')
   OR (t.phase='completion' AND NOT is_reviewer) THEN
   RAISE EXCEPTION 'This document category is not available for this file or user';END IF;
 IF p_additional AND (t.required OR t.label !~* 'addendum|extension') THEN
   RAISE EXCEPTION 'Only optional addendums accept multiple documents';END IF;
 SELECT * INTO f FROM public.deal_documents WHERE id=p_document AND deal_id=p_deal;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select a document already uploaded to this transaction';END IF;
 IF NOT is_reviewer AND split_part(f.path,'/',1)<>auth.uid()::text THEN
   RAISE EXCEPTION 'Only your own uploaded documents can be linked';END IF;
 IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='transaction-files' AND o.name=f.path) THEN
   RAISE EXCEPTION 'Document was not found in private transaction storage';END IF;
 label_to_save:=CASE WHEN p_additional THEN
    left(t.label,175)||' — additional '||left(f.name,35)||' — '||left(f.id::text,8)
   ELSE t.label END;
 SELECT * INTO r FROM public.deal_requirements WHERE deal_id=p_deal AND label=label_to_save FOR UPDATE;
 IF FOUND AND (r.verified OR r.rv_waived) THEN
  RAISE EXCEPTION 'This document has been verified or waived. Ask Back Office to review any correction';END IF;
 IF FOUND THEN
  UPDATE public.deal_requirements SET document_id=f.id,verified=false,rv_phase=t.phase,
    rv_required=CASE WHEN p_additional THEN false ELSE t.required END,
    rv_waived=false,rv_waiver_reason='',rv_verified_at=NULL,rv_verified_by=NULL
  WHERE id=r.id RETURNING id INTO result_id;
 ELSE
  INSERT INTO public.deal_requirements(deal_id,label,document_id,verified,rv_phase,rv_required)
  VALUES(p_deal,label_to_save,f.id,false,t.phase,CASE WHEN p_additional THEN false ELSE t.required END)
  RETURNING id INTO result_id;
 END IF;
 RETURN result_id;
END $$;
REVOKE ALL ON FUNCTION public.rv_link_uploaded_compliance_doc(uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv_link_uploaded_compliance_doc(uuid,uuid,text,boolean) TO authenticated;
COMMIT;
