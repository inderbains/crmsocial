-- RealVolt 044: brokerage form templates, staged compliance, read-only closing manifest.
-- Requires installed 006, 034 and 035 migrations. Run as one query in staging first.
BEGIN;
ALTER TABLE public.deal_requirements
  ADD COLUMN IF NOT EXISTS rv_phase text NOT NULL DEFAULT 'offer',
  ADD COLUMN IF NOT EXISTS rv_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rv_waived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rv_waiver_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rv_verified_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rv_verified_at timestamptz;
UPDATE public.deal_requirements r SET rv_phase='listing'
 FROM public.deal_files d WHERE d.id=r.deal_id AND d.kind='Listing' AND r.rv_phase='offer';
ALTER TABLE public.deal_requirements ADD CONSTRAINT rv_compliance_valid_waiver
 CHECK (NOT rv_waived OR (length(trim(rv_waiver_reason))>3 AND NOT verified));
CREATE TABLE IF NOT EXISTS public.rv_compliance_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 brokerage_id uuid NOT NULL REFERENCES public.brokerages(id),
 kind text NOT NULL CHECK (kind IN ('Listing','Sale')),
 phase text NOT NULL CHECK (phase IN ('listing','offer','firm','completion')),
 representation text NOT NULL DEFAULT 'any' CHECK (representation IN ('any','listing','selling')),
 label text NOT NULL CHECK (length(trim(label))>0),
 required boolean NOT NULL DEFAULT true,
 active boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL DEFAULT 100,
 UNIQUE(brokerage_id,kind,phase,representation,label)
);
ALTER TABLE public.rv_compliance_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY rv_templates_read ON public.rv_compliance_templates FOR SELECT TO authenticated
 USING (brokerage_id=public.current_brokerage());
CREATE POLICY rv_templates_insert ON public.rv_compliance_templates FOR INSERT TO authenticated
 WITH CHECK (brokerage_id=public.current_brokerage() AND public.is_brokerage_admin(brokerage_id));
CREATE POLICY rv_templates_update ON public.rv_compliance_templates FOR UPDATE TO authenticated
 USING (brokerage_id=public.current_brokerage() AND public.is_brokerage_admin(brokerage_id))
 WITH CHECK (brokerage_id=public.current_brokerage() AND public.is_brokerage_admin(brokerage_id));
GRANT SELECT,INSERT,UPDATE ON public.rv_compliance_templates TO authenticated;
CREATE OR REPLACE FUNCTION public.rv_seed_brokerage_compliance(p_brokerage uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 INSERT INTO public.rv_compliance_templates(brokerage_id,kind,phase,representation,label,required,sort_order)
 SELECT p_brokerage,v.kind,v.phase,v.representation,v.label,v.required,v.sort_order
 FROM (VALUES
 ('Listing','listing','any','Signed listing contract',true,10),
 ('Listing','listing','any','MLS listing sheet / listing details',true,20),
 ('Listing','listing','any','Disclosure (listing)',true,30),
 ('Listing','listing','any','FINTRAC identity verification',true,40),
 ('Listing','listing','any','Listing addendum (if applicable)',false,50),
 ('Sale','offer','any','Signed purchase and sale contract',true,10),
 ('Sale','offer','listing','Commission disclosure',true,20),
 ('Sale','offer','selling','Disclosure of services / representation',true,20),
 ('Sale','offer','selling','FINTRAC identity verification — buyer(s)',true,30),
 ('Sale','offer','any','Contract addendum (if applicable)',false,40),
 ('Sale','firm','any','Signed subject removal / unconditional contract',true,10),
 ('Sale','firm','listing','Trade record sheet',true,20),
 ('Sale','firm','listing','Sale report form',true,30),
 ('Sale','firm','selling','Deposit cheque copy / deposit receipt',true,20),
 ('Sale','firm','any','Subject extension or other addendum (if applicable)',false,40),
 ('Sale','completion','any','Lawyer completion letter',true,10),
 ('Sale','completion','any','Brokerage completion confirmation (PDF)',true,20),
 ('Sale','completion','any','Commission Instruction Report — CIR (PDF)',true,30),
 ('Sale','completion','any','Internal commission payable statement (PDF)',true,40)
 ) v(kind,phase,representation,label,required,sort_order)
 ON CONFLICT(brokerage_id,kind,phase,representation,label) DO NOTHING;
 END $$;
REVOKE ALL ON FUNCTION public.rv_seed_brokerage_compliance(uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.rv_brokerage_compliance_created() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM public.rv_seed_brokerage_compliance(NEW.id);RETURN NEW;
 END $$;
DROP TRIGGER IF EXISTS rv_brokerage_compliance_created ON public.brokerages;
CREATE TRIGGER rv_brokerage_compliance_created AFTER INSERT ON public.brokerages
 FOR EACH ROW EXECUTE FUNCTION public.rv_brokerage_compliance_created();
SELECT public.rv_seed_brokerage_compliance(b.id) FROM public.brokerages b;
CREATE OR REPLACE FUNCTION public.rv_seed_deal_compliance(p_deal uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
 DECLARE d public.deal_files; v_phase text; BEGIN
 SELECT * INTO d FROM public.deal_files WHERE id=p_deal;
 IF NOT FOUND OR d.brokerage_id IS NULL THEN RETURN;END IF;
 FOR v_phase IN SELECT unnest(CASE WHEN d.kind='Listing' THEN ARRAY['listing']::text[]
   WHEN d.rv_stage IN ('Completed','Archived') THEN ARRAY['offer','firm','completion']::text[]
   WHEN d.rv_stage='Sold' THEN ARRAY['offer','firm']::text[]
   ELSE ARRAY['offer']::text[] END) LOOP
  INSERT INTO public.deal_requirements(deal_id,label,rv_phase,rv_required)
  SELECT d.id,t.label,v_phase,t.required FROM public.rv_compliance_templates t
  WHERE t.brokerage_id=d.brokerage_id AND t.kind=d.kind AND t.phase=v_phase
    AND t.active AND (t.representation='any' OR t.representation=d.representation)
  ON CONFLICT(deal_id,label) DO UPDATE
    SET rv_phase=EXCLUDED.rv_phase,rv_required=EXCLUDED.rv_required;
 END LOOP;
 IF d.kind='Sale' AND d.rv_stage IN ('Completed','Archived') AND d.rv_completion_letter IS NOT NULL THEN
  UPDATE public.deal_requirements SET document_id=d.rv_completion_letter,verified=false
  WHERE deal_id=d.id AND label='Lawyer completion letter' AND document_id IS NULL;
 END IF;
 END $$;
REVOKE ALL ON FUNCTION public.rv_seed_deal_compliance(uuid) FROM PUBLIC,anon;
-- Seeding is intentionally trigger-only; authenticated users cannot modify other files via this helper.
CREATE OR REPLACE FUNCTION public.rv_compliance_deal_trigger() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 PERFORM public.rv_seed_deal_compliance(NEW.id);RETURN NEW;END $$;
DROP TRIGGER IF EXISTS rv_compliance_seed ON public.deal_files;
CREATE TRIGGER rv_compliance_seed AFTER INSERT OR UPDATE OF rv_stage,representation ON public.deal_files
 FOR EACH ROW EXECUTE FUNCTION public.rv_compliance_deal_trigger();
SELECT public.rv_seed_deal_compliance(d.id) FROM public.deal_files d WHERE d.brokerage_id IS NOT NULL AND d.rv_stage IS DISTINCT FROM 'Archived';
-- Admin-only sync for newly added form templates, scoped to this brokerage.
CREATE OR REPLACE FUNCTION public.rv_refresh_brokerage_compliance() RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
 DECLARE b uuid:=public.current_brokerage(); d record; n integer:=0; BEGIN
 IF b IS NULL OR auth.uid() IS NULL OR NOT public.is_brokerage_admin(b) THEN
  RAISE EXCEPTION 'Brokerage admin required';END IF;
 FOR d IN SELECT id FROM public.deal_files WHERE brokerage_id=b AND rv_stage IS DISTINCT FROM 'Archived' LOOP
  PERFORM public.rv_seed_deal_compliance(d.id);n:=n+1;
 END LOOP;RETURN n;END $$;
REVOKE ALL ON FUNCTION public.rv_refresh_brokerage_compliance() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv_refresh_brokerage_compliance() TO authenticated;
-- The original approval guard must ignore optional or properly waived items.
CREATE OR REPLACE FUNCTION public.require_complete_deal() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.review_status='Approved' AND OLD.review_status IS DISTINCT FROM 'Approved' THEN
  IF NOT EXISTS(SELECT 1 FROM public.deal_requirements WHERE deal_id=NEW.id AND rv_required AND NOT rv_waived)
   OR EXISTS(SELECT 1 FROM public.deal_requirements WHERE deal_id=NEW.id AND rv_required
    AND NOT rv_waived AND (NOT verified OR document_id IS NULL))
  THEN RAISE EXCEPTION 'Verify all mandatory compliance documents before approval, or record an authorized waiver';END IF;
 END IF;RETURN NEW;END $$;
-- Retain the existing linked-document check and stamp reviewer identity on verification.
CREATE OR REPLACE FUNCTION public.check_required_document() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.verified AND (NEW.document_id IS NULL OR NEW.rv_waived) THEN
  RAISE EXCEPTION 'Link an uploaded document to verify it';END IF;
 IF NEW.rv_waived AND (length(trim(NEW.rv_waiver_reason))<=3 OR NEW.verified) THEN
  RAISE EXCEPTION 'Provide a waiver reason and clear verification';END IF;
 IF NEW.document_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.deal_documents
  WHERE id=NEW.document_id AND deal_id=NEW.deal_id) THEN
  RAISE EXCEPTION 'The document must belong to this transaction';END IF;
 IF NEW.verified AND (TG_OP='INSERT' OR OLD.verified IS DISTINCT FROM TRUE OR OLD.document_id IS DISTINCT FROM NEW.document_id) THEN
  NEW.rv_verified_at=now();NEW.rv_verified_by=auth.uid();
 ELSIF NOT NEW.verified THEN NEW.rv_verified_at=NULL;NEW.rv_verified_by=NULL;END IF;
 RETURN NEW;END $$;
-- Reject attempts to bypass the closing workflow by calling legacy rv_tx_action('archive').
CREATE OR REPLACE FUNCTION public.rv_compliance_archive_guard() RETURNS trigger
 LANGUAGE plpgsql SET search_path='' AS $$ BEGIN
 IF NEW.rv_stage='Archived' AND OLD.rv_stage IS DISTINCT FROM 'Archived' AND NEW.kind='Sale' THEN
  IF EXISTS(SELECT 1 FROM public.deal_requirements r WHERE r.deal_id=NEW.id AND r.rv_required
     AND NOT r.rv_waived AND (NOT r.verified OR r.document_id IS NULL)) THEN
    RAISE EXCEPTION 'Resolve required compliance documents before archiving';END IF;
  IF EXISTS(SELECT 1 FROM public.deal_requirements r WHERE r.deal_id=NEW.id
    AND r.label IN ('Brokerage completion confirmation (PDF)','Commission Instruction Report — CIR (PDF)','Internal commission payable statement (PDF)')
    AND (r.document_id IS NULL OR NOT r.verified OR r.rv_waived))
    OR (SELECT count(*) FROM public.deal_requirements r WHERE r.deal_id=NEW.id
        AND r.label IN ('Brokerage completion confirmation (PDF)','Commission Instruction Report — CIR (PDF)','Internal commission payable statement (PDF)'))<>3
    THEN RAISE EXCEPTION 'Completion confirmation, CIR and internal commission statement are mandatory at close';END IF;
 END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS rv_compliance_archive_guard ON public.deal_files;
CREATE TRIGGER rv_compliance_archive_guard BEFORE UPDATE ON public.deal_files
 FOR EACH ROW EXECUTE FUNCTION public.rv_compliance_archive_guard();
-- Final approved-stage folder manifest. Documents remain in their original private storage paths.
CREATE TABLE IF NOT EXISTS public.rv_closed_file_folders (
 deal_id uuid PRIMARY KEY REFERENCES public.deal_files(id),
 brokerage_id uuid NOT NULL REFERENCES public.brokerages(id),
 folder_prefix text NOT NULL,
 document_manifest jsonb NOT NULL,
 closed_at timestamptz NOT NULL DEFAULT now(),
 closed_by uuid NOT NULL REFERENCES auth.users(id)
);
ALTER TABLE public.rv_closed_file_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY rv_closed_folders_read ON public.rv_closed_file_folders FOR SELECT TO authenticated
 USING (brokerage_id=public.current_brokerage() AND EXISTS(
 SELECT 1 FROM public.deal_files d WHERE d.id=deal_id
 AND (d.user_id=auth.uid() OR public.can_review_deal(d.user_id))));
GRANT SELECT ON public.rv_closed_file_folders TO authenticated;
-- Every successful archive action, including the legacy RPC, snapshots the exact private file list.
CREATE OR REPLACE FUNCTION public.rv_snapshot_closed_deal() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
 DECLARE v_manifest jsonb; BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'path',x.path,
   'phase',coalesce(r.rv_phase,'other'),'verified',coalesce(r.verified,false),
   'label',r.label) ORDER BY x.created_at,x.id),'[]'::jsonb) INTO v_manifest
 FROM public.deal_documents x LEFT JOIN LATERAL (
  SELECT q.rv_phase,q.verified,q.label FROM public.deal_requirements q
  WHERE q.deal_id=NEW.id AND q.document_id=x.id ORDER BY q.rv_phase LIMIT 1
 ) r ON true WHERE x.deal_id=NEW.id;
 INSERT INTO public.rv_closed_file_folders(deal_id,brokerage_id,folder_prefix,document_manifest,closed_by)
 VALUES(NEW.id,NEW.brokerage_id,NEW.user_id::text||'/'||NEW.id::text||'/',v_manifest,auth.uid())
 ON CONFLICT(deal_id) DO NOTHING;
 RETURN NEW;END $$;
DROP TRIGGER IF EXISTS rv_snapshot_closed_deal ON public.deal_files;
CREATE TRIGGER rv_snapshot_closed_deal AFTER UPDATE OF rv_stage ON public.deal_files
 FOR EACH ROW WHEN (NEW.rv_stage='Archived' AND OLD.rv_stage IS DISTINCT FROM 'Archived')
 EXECUTE FUNCTION public.rv_snapshot_closed_deal();
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
 IF EXISTS(SELECT 1 FROM public.deal_requirements r WHERE r.deal_id=p_deal AND r.label IN ('Brokerage completion confirmation (PDF)','Commission Instruction Report — CIR (PDF)','Internal commission payable statement (PDF)') AND (r.document_id IS NULL OR NOT r.verified OR r.rv_waived)) THEN RAISE EXCEPTION 'Completion confirmation, CIR and commission payable PDFs must be attached and verified';END IF;
 IF v_manifest='[]'::jsonb THEN RAISE EXCEPTION 'Cannot archive an empty transaction folder';END IF;
 PERFORM set_config('realvolt.lifecycle_rpc','yes',true);
 UPDATE public.deal_files SET rv_stage='Archived' WHERE id=p_deal;
 INSERT INTO public.rv_closed_file_folders(deal_id,brokerage_id,folder_prefix,document_manifest,closed_by)
 VALUES(d.id,d.brokerage_id,d.user_id::text||'/'||d.id::text||'/',v_manifest,auth.uid()) ON CONFLICT(deal_id) DO NOTHING;
 INSERT INTO public.transaction_audit_events(deal_id,actor_id,action,new_values)
 VALUES(d.id,auth.uid(),'Compliance file closed',jsonb_build_object('document_count',jsonb_array_length(v_manifest)));
 PERFORM public.rv_tx_notice(d,'agent','File closed and archived');
 END $$;
REVOKE ALL ON FUNCTION public.rv_close_compliant_file(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv_close_compliant_file(uuid) TO authenticated;
COMMIT;
