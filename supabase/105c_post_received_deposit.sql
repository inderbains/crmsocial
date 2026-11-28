BEGIN;
-- Internal function: no direct client grant. Only full, positive, attested receipts.
CREATE OR REPLACE FUNCTION public.rv105_post_saved_receipt(p_deal uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deal_files; a public.office_bank_accounts; aid uuid; n integer; posted uuid; state text; prev text;
BEGIN
 SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR d.brokerage_id IS NULL OR d.brokerage_id IS DISTINCT FROM public.current_brokerage()
 OR (d.user_id=auth.uid() OR (public.is_brokerage_admin(d.brokerage_id) AND public.can_review_deal(d.user_id))) IS NOT TRUE
 OR d.kind IS DISTINCT FROM 'Sale' OR d.rv_stage IS DISTINCT FROM 'Sold' OR coalesce(d.review_status,'') NOT IN ('Submitted','Approved','Changes requested') OR d.rv_deleted_at IS NOT NULL
 OR d.deposit_holder IS DISTINCT FROM 'our_brokerage' OR d.rv105_received_on IS NULL OR d.rv105_receipt_document IS NULL OR d.rv105_received_on>(now() AT TIME ZONE 'America/Vancouver')::date
 OR d.deposit_amount IS NULL OR d.deposit_amount<=0 OR d.deposit_amount<>round(d.deposit_amount,2) THEN RAISE EXCEPTION 'Recorded client receipt is unavailable'; END IF;
 IF d.rv105_receipt_ledger_id IS NOT NULL THEN RETURN 'posted'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.deal_documents doc JOIN storage.objects o ON o.bucket_id='transaction-files' AND o.name=doc.path WHERE doc.id=d.rv105_receipt_document AND doc.deal_id=d.id) THEN RAISE EXCEPTION 'Receipt evidence is unavailable'; END IF;
 -- Same bank-row lock order as Fix 102; serialize against manual posting.
 PERFORM id FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id AND kind='Trust' ORDER BY id FOR UPDATE;
 SELECT id INTO aid FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id AND kind='Trust' AND active AND rv105_default;
 IF aid IS NULL THEN
   SELECT count(*) INTO n FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id AND kind='Trust' AND active;
   IF n=1 THEN SELECT id INTO aid FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id AND kind='Trust' AND active; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.office_ledger l JOIN public.office_bank_accounts b ON b.id=l.account_id WHERE l.brokerage_id=d.brokerage_id AND b.brokerage_id=d.brokerage_id AND b.kind='Trust' AND (l.deal_id=d.id OR l.deal_id=d.parent_listing_id)) THEN
   state:='existing_entries';
 ELSIF aid IS NULL THEN state:='bank_setup_required';
 ELSE
   SELECT * INTO a FROM public.office_bank_accounts WHERE id=aid AND brokerage_id=d.brokerage_id AND kind='Trust' AND active;
   IF NOT FOUND THEN state:='bank_setup_required';
   ELSIF d.rv105_received_on<a.opening_date OR EXISTS(SELECT 1 FROM public.office_reconciliations WHERE account_id=aid AND period_end>=d.rv105_received_on) OR EXISTS(SELECT 1 FROM public.office_periods WHERE brokerage_id=d.brokerage_id AND locked AND period_end>=d.rv105_received_on) THEN state:='accounting_period_review';
   ELSE
     INSERT INTO public.office_ledger(brokerage_id,account_id,deal_id,entry_date,description,amount,reference)
     VALUES(d.brokerage_id,aid,d.id,d.rv105_received_on,'Client deposit received — firm sale',d.deposit_amount,'Receipt document '||d.rv105_receipt_document::text) RETURNING id INTO posted;
     INSERT INTO public.transaction_audit_events(deal_id,actor_id,action,new_values) VALUES(d.id,auth.uid(),'Client deposit recorded in trust',jsonb_build_object('ledger_id',posted,'account_id',aid,'amount',d.deposit_amount,'entry_date',d.rv105_received_on,'document_id',d.rv105_receipt_document));
     state:='posted';
   END IF;
 END IF;
 prev:=current_setting('realvolt.lifecycle_rpc',true);
 PERFORM set_config('realvolt.lifecycle_rpc','yes',true);
 UPDATE public.deal_files SET rv105_receipt_status=state,rv105_receipt_ledger_id=posted WHERE id=d.id;
 PERFORM set_config('realvolt.lifecycle_rpc',coalesce(prev,'no'),true);
 RETURN state;
END; $$;
REVOKE ALL ON FUNCTION public.rv105_post_saved_receipt(uuid) FROM PUBLIC,anon,authenticated;
COMMIT;
