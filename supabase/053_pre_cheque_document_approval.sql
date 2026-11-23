-- Fix 053: explicit Back Office compliance sign-off BEFORE commission cheque issue.
-- Install after 052; run on staging first, then production after backup.
-- Only new commission cheque issuance is gated; existing issued cheques aren't changed.
BEGIN;

CREATE TABLE IF NOT EXISTS public.rv_commission_release_approvals (
  payout_id uuid PRIMARY KEY REFERENCES public.agent_payouts(id) ON DELETE RESTRICT,
  deal_id uuid NOT NULL REFERENCES public.deal_files(id),
  brokerage_id uuid NOT NULL REFERENCES public.brokerages(id),
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  document_fingerprint text NOT NULL,
  reviewed_required integer NOT NULL CHECK(reviewed_required > 0)
);
ALTER TABLE public.rv_commission_release_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rv_release_approvals_read ON public.rv_commission_release_approvals;
CREATE POLICY rv_release_approvals_read ON public.rv_commission_release_approvals FOR SELECT TO authenticated
 USING (public.is_brokerage_admin(brokerage_id));
GRANT SELECT ON public.rv_commission_release_approvals TO authenticated;

-- The internal payable statement is intentionally generated AFTER an issued agent payout;
-- it cannot be a prerequisite for authorizing that same payout.
CREATE OR REPLACE FUNCTION public.rv_release_document_snapshot(p_deal uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_deal public.deal_files; v_required integer; v_verified integer;
        v_missing text[]; v_waived integer; v_signature text;
BEGIN
 SELECT * INTO v_deal FROM public.deal_files WHERE id=p_deal;
 IF NOT FOUND OR NOT public.is_brokerage_admin(v_deal.brokerage_id)
 THEN RAISE EXCEPTION 'Brokerage admin access required'; END IF;
 SELECT count(*)::integer,
        count(*) FILTER (WHERE r.rv_waived OR (r.verified AND r.document_id IS NOT NULL AND doc.id IS NOT NULL
          AND doc.deal_id = p_deal AND NOT (upper(doc.name) LIKE ANY(ARRAY['%AGENTEXPENSESBYDATE%','%AGENTGSTREPORT%','%CHEQUE_ALIGNMENT_SAMPLE%']))))::integer,
        coalesce(array_agg(r.label ORDER BY r.rv_phase,r.label) FILTER (WHERE NOT (r.rv_waived OR
          (r.verified AND r.document_id IS NOT NULL AND doc.id IS NOT NULL AND doc.deal_id=p_deal AND
          NOT (upper(doc.name) LIKE ANY(ARRAY['%AGENTEXPENSESBYDATE%','%AGENTGSTREPORT%','%CHEQUE_ALIGNMENT_SAMPLE%']))))),ARRAY[]::text[]),
        count(*) FILTER (WHERE r.rv_waived)::integer,
        md5(coalesce(string_agg(concat_ws('|',r.id::text,r.label,r.rv_phase,coalesce(r.document_id::text,''),
          r.verified::text,r.rv_waived::text,coalesce(r.rv_waiver_reason,''),coalesce(r.rv_verified_at::text,''),
          coalesce(doc.path,''),coalesce(doc.name,'')), ';' ORDER BY r.id::text),''))
 INTO v_required,v_verified,v_missing,v_waived,v_signature
 FROM public.deal_requirements r
 LEFT JOIN public.deal_documents doc ON doc.id=r.document_id AND doc.deal_id=r.deal_id
 WHERE r.deal_id=p_deal AND r.rv_required IS DISTINCT FROM false
   AND r.label <> 'Internal commission payable statement (PDF)';
 RETURN jsonb_build_object('required',v_required,'verified',v_verified,'waived',v_waived,
     'missing',v_missing,'fingerprint',v_signature);
END $$;
REVOKE ALL ON FUNCTION public.rv_release_document_snapshot(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv_release_document_snapshot(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rv_release_gate_status(p_payout uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payout public.agent_payouts; v_deal public.deal_files;
        v_snapshot jsonb; v_approval public.rv_commission_release_approvals; v_ready boolean;
BEGIN
 SELECT * INTO v_payout FROM public.agent_payouts WHERE id=p_payout;
 IF NOT FOUND OR NOT public.is_brokerage_admin(v_payout.brokerage_id)
 THEN RAISE EXCEPTION 'Payout unavailable'; END IF;
 SELECT * INTO v_deal FROM public.deal_files WHERE id=v_payout.deal_id;
 v_snapshot:=public.rv_release_document_snapshot(v_payout.deal_id);
 SELECT * INTO v_approval FROM public.rv_commission_release_approvals WHERE payout_id=p_payout;
 v_ready := coalesce((v_snapshot->>'required')::integer,0)>0
   AND (v_snapshot->>'required')::integer=(v_snapshot->>'verified')::integer
   AND v_deal.rv_stage='Completed' AND v_deal.review_status='Approved'
   AND coalesce(v_deal.rv_funds_verified,false);
 RETURN (v_snapshot - 'fingerprint') || jsonb_build_object(
   'approved',v_ready AND v_approval.payout_id IS NOT NULL
      AND v_approval.document_fingerprint=(v_snapshot->>'fingerprint'),
   'ready_for_review',v_ready,
   'approved_by',CASE WHEN v_approval.payout_id IS NOT NULL THEN v_approval.approved_by::text ELSE null END,
   'approved_at',v_approval.approved_at,
   'payout_status',v_payout.status,
   'legal_completion',v_deal.rv_stage='Completed',
   'funds_verified',coalesce(v_deal.rv_funds_verified,false));
END $$;
REVOKE ALL ON FUNCTION public.rv_release_gate_status(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv_release_gate_status(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rv_approve_commission_release(p_payout uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payout public.agent_payouts; v_status jsonb; v_snapshot jsonb;
BEGIN
 SELECT * INTO v_payout FROM public.agent_payouts WHERE id=p_payout FOR UPDATE;
 IF NOT FOUND OR NOT public.is_brokerage_admin(v_payout.brokerage_id) OR v_payout.status<>'Authorized'
 THEN RAISE EXCEPTION 'Authorized commission payout and brokerage admin required'; END IF;
 -- Document review and release approval must be explicit and separate from payout calculation.
 v_status:=public.rv_release_gate_status(p_payout);
 IF NOT coalesce((v_status->>'ready_for_review')::boolean,false)
 THEN RAISE EXCEPTION 'Cannot approve cheque release: verify every required pre-payment document, legal completion and commission receipt first'; END IF;
 v_snapshot:=public.rv_release_document_snapshot(v_payout.deal_id);
 INSERT INTO public.rv_commission_release_approvals
   (payout_id,deal_id,brokerage_id,approved_by,approved_at,document_fingerprint,reviewed_required)
 VALUES(p_payout,v_payout.deal_id,v_payout.brokerage_id,auth.uid(),now(),v_snapshot->>'fingerprint',(v_snapshot->>'required')::integer)
 ON CONFLICT(payout_id) DO UPDATE SET
   approved_by=excluded.approved_by,approved_at=excluded.approved_at,
   document_fingerprint=excluded.document_fingerprint,reviewed_required=excluded.reviewed_required;
END $$;
REVOKE ALL ON FUNCTION public.rv_approve_commission_release(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv_approve_commission_release(uuid) TO authenticated;

-- Enforced on the actual issue RPC: hiding the button is not the security boundary.
CREATE OR REPLACE FUNCTION public.issue_office_cheque(cheque uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.office_cheques; entry uuid; v_status jsonb;
BEGIN
 SELECT * INTO c FROM public.office_cheques WHERE id=cheque FOR UPDATE;
 IF c.id IS NULL OR NOT public.is_brokerage_admin(c.brokerage_id)
 THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF c.status='Issued' THEN RETURN; END IF;
 IF c.status<>'Prepared' THEN RAISE EXCEPTION 'Only prepared cheques can be issued'; END IF;
 IF c.payout_id IS NOT NULL THEN
   v_status:=public.rv_release_gate_status(c.payout_id);
   IF NOT coalesce((v_status->>'approved')::boolean,false)
   THEN RAISE EXCEPTION 'Cheque not released: Back Office must verify the required documents and explicitly approve commission cheque release. Reapprove after any document changes.';
   END IF;
   PERFORM public.mark_agent_payout_paid(c.payout_id,c.account_id,c.payment_date,c.cheque_number);
   SELECT ledger_id INTO entry FROM public.agent_payouts WHERE id=c.payout_id;
 ELSE
   PERFORM 1 FROM public.office_bank_accounts WHERE id=c.account_id FOR UPDATE;
   IF c.amount>(SELECT coalesce(sum(amount),0) FROM public.office_ledger
     WHERE account_id=c.account_id AND deal_id=c.deal_id AND entry_date<=c.payment_date)
   THEN RAISE EXCEPTION 'Insufficient trust funds by cheque date'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.deal_files
     WHERE id=c.deal_id AND review_status='Approved' AND brokerage_id=c.brokerage_id)
   THEN RAISE EXCEPTION 'File must remain approved'; END IF;
   entry=public.post_office_entry(c.account_id,c.deal_id,c.payment_date,
      'Trust cheque to '||c.payee||': '||c.memo,-c.amount,c.cheque_number);
 END IF;
 UPDATE public.office_cheques SET status='Issued',issued_at=now(),ledger_id=entry WHERE id=cheque;
END $$;
REVOKE ALL ON FUNCTION public.issue_office_cheque(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.issue_office_cheque(uuid) TO authenticated;
COMMIT;
