-- Fix 099. Requires Fix 072/073, 095 and 097. Run on staging first.
BEGIN;
-- Keep the redundant internally generated completion confirmation optional.
UPDATE public.rv_compliance_templates SET required=false
 WHERE kind='Sale' AND label='Brokerage completion confirmation (PDF)';
UPDATE public.deal_requirements SET rv_required=false
 WHERE rv_phase='completion' AND label='Brokerage completion confirmation (PDF)'
 AND EXISTS (SELECT 1 FROM public.deal_files d WHERE d.id=deal_requirements.deal_id AND d.rv_stage IS DISTINCT FROM 'Archived');

-- Only the authenticated, authorization-checked server function may register a generated statement.
CREATE OR REPLACE FUNCTION public.rv099_register_statement(p_deal uuid,p_actor uuid,p_payout uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deal_files; p public.agent_payouts; doc_id uuid; file_path text;
BEGIN
 SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND OR d.kind<>'Sale' OR d.rv_stage<>'Completed' OR d.review_status<>'Approved'
 OR NOT d.rv_funds_verified OR d.rv_completion_letter IS NULL OR d.rv_completed_date IS NULL OR d.rv_deleted_at IS NOT NULL
 OR NOT EXISTS (SELECT 1 FROM public.brokerage_members m JOIN public.brokerage_members o ON o.brokerage_id=m.brokerage_id
 JOIN public.transaction_reviewers r ON r.agent_id=o.user_id AND r.admin_id=m.user_id
 WHERE m.user_id=p_actor AND m.role='admin' AND m.brokerage_id=d.brokerage_id AND o.user_id=d.user_id)
 THEN RAISE EXCEPTION 'Authorized completed sale required'; END IF;
 SELECT * INTO p FROM public.agent_payouts WHERE id=p_payout AND deal_id=d.id AND brokerage_id=d.brokerage_id FOR UPDATE;
 IF NOT FOUND OR p.status<>'Paid' OR p.paid_date IS NULL OR p.ledger_id IS NULL THEN
 RAISE EXCEPTION 'Actual recorded agent payment required'; END IF;
 file_path:='rv-system/'||d.id::text||'/completion/commission-'||p.id::text||'.pdf';
 IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='transaction-files' AND name=file_path) THEN
 RAISE EXCEPTION 'Generated statement missing from private storage'; END IF;
 SELECT id INTO doc_id FROM public.deal_documents WHERE deal_id=d.id AND path=file_path;
 IF doc_id IS NULL THEN
  INSERT INTO public.deal_documents(deal_id,name,path) VALUES(d.id,'Internal_Commission_Payable_Statement.pdf',file_path) RETURNING id INTO doc_id;
  INSERT INTO public.transaction_audit_events(deal_id,actor_id,action,new_values) VALUES(d.id,p_actor,'Commission statement automatically generated',jsonb_build_object('document_id',doc_id,'payout_id',p.id));
 END IF;
 INSERT INTO public.deal_requirements(deal_id,label,document_id,verified,rv_phase,rv_required)
 VALUES(d.id,'Internal commission payable statement (PDF)',doc_id,false,'completion',false)
 ON CONFLICT(deal_id,label) DO UPDATE SET document_id=excluded.document_id, verified=false,rv_phase='completion',rv_required=false,rv_waived=false,rv_waiver_reason='',rv_verified_by=NULL,rv_verified_at=NULL
 WHERE public.deal_requirements.document_id IS DISTINCT FROM excluded.document_id;
 RETURN doc_id;
END $$;
REVOKE ALL ON FUNCTION public.rv099_register_statement(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rv099_register_statement(uuid,uuid,uuid) TO service_role;

-- Preserve all existing closing guards. Require the automatic statement before newly closing a paid file.
CREATE OR REPLACE FUNCTION public.rv099_statement_before_archive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.kind='Sale' AND NEW.rv_stage='Archived' AND OLD.rv_stage IS DISTINCT FROM 'Archived' AND OLD.rv_stage='Completed'
 AND NOT EXISTS(SELECT 1 FROM public.agent_payouts p JOIN public.deal_documents f ON f.deal_id=p.deal_id
 JOIN storage.objects s ON s.bucket_id='transaction-files' AND s.name=f.path
 WHERE p.deal_id=NEW.id AND p.brokerage_id=NEW.brokerage_id AND p.status='Paid'
 AND f.path='rv-system/'||NEW.id::text||'/completion/commission-'||p.id::text||'.pdf') THEN
 RAISE EXCEPTION 'Automatic commission statement is not saved yet. Open the completed file and allow the automatic process to finish; check Compliance for errors.';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rv099_statement_before_archive ON public.deal_files;
CREATE TRIGGER rv099_statement_before_archive BEFORE UPDATE OF rv_stage ON public.deal_files FOR EACH ROW EXECUTE FUNCTION public.rv099_statement_before_archive();
COMMIT;
