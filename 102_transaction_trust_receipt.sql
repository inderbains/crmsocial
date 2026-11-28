-- RealVolt 102: record an actual full client deposit against a submitted firm sale.
-- No historical entries are inserted by this migration. Uses existing posting rules.
BEGIN;
CREATE OR REPLACE FUNCTION public.rv102_record_trust_receipt(
 p_deal uuid, p_account uuid, p_amount numeric, p_day date, p_reference text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 d public.deal_files;
 a public.office_bank_accounts;
 prior public.office_ledger;
 posted uuid;
 n integer;
 ref text:=btrim(coalesce(p_reference,''));
BEGIN
 SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR d.brokerage_id IS NULL
   OR NOT public.is_brokerage_admin(d.brokerage_id)
   OR d.brokerage_id IS DISTINCT FROM public.current_brokerage()
   OR NOT (d.user_id=auth.uid() OR public.can_review_deal(d.user_id))
   OR d.kind IS DISTINCT FROM 'Sale' OR d.rv_stage IS DISTINCT FROM 'Sold'
   OR coalesce(d.review_status,'') NOT IN ('Submitted','Approved')
   OR d.deposit_holder IS DISTINCT FROM 'our_brokerage'
 THEN RAISE EXCEPTION 'A submitted firm sale with our brokerage holding the deposit and an authorized reviewer is required'; END IF;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount IS DISTINCT FROM round(p_amount,2)
   OR coalesce(d.deposit_amount,0)<=0 OR p_amount<>round(d.deposit_amount,2)
   OR p_day IS NULL OR p_day>(now() AT TIME ZONE 'America/Vancouver')::date
   OR length(ref)<3 OR length(ref)>200
 THEN RAISE EXCEPTION 'Enter the full actual deposit matching the saved sale amount, the bank deposit date and a real receipt reference'; END IF;
 -- The manual ledger RPC also locks its bank account. Lock all Trust accounts for
 -- this brokerage before checking entries to serialize against concurrent posts.
 PERFORM id FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id AND kind='Trust' ORDER BY id FOR UPDATE;
 SELECT * INTO a FROM public.office_bank_accounts WHERE id=p_account;
 IF NOT FOUND OR a.brokerage_id IS DISTINCT FROM d.brokerage_id OR a.kind IS DISTINCT FROM 'Trust' OR NOT a.active
 THEN RAISE EXCEPTION 'Select an active Trust account belonging to this brokerage'; END IF;
 -- Do not silently duplicate or reallocate money already posted on the linked listing.
 IF d.parent_listing_id IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.office_ledger l JOIN public.office_bank_accounts b ON b.id=l.account_id
   WHERE l.brokerage_id=d.brokerage_id AND b.brokerage_id=d.brokerage_id AND b.kind='Trust' AND l.deal_id=d.parent_listing_id
 ) THEN RAISE EXCEPTION 'Trust entries already exist on the linked listing. Review and allocate existing funds in Trust & Bank before posting'; END IF;
 SELECT count(*) INTO n FROM public.office_ledger l JOIN public.office_bank_accounts b ON b.id=l.account_id
 WHERE l.brokerage_id=d.brokerage_id AND b.brokerage_id=d.brokerage_id AND b.kind='Trust' AND l.deal_id=d.id;
 IF n>0 THEN
   IF n=1 THEN
     SELECT l.* INTO prior FROM public.office_ledger l JOIN public.office_bank_accounts b ON b.id=l.account_id
     WHERE l.brokerage_id=d.brokerage_id AND b.brokerage_id=d.brokerage_id AND b.kind='Trust' AND l.deal_id=d.id;
     IF prior.account_id=p_account AND prior.amount=p_amount AND prior.entry_date=p_day AND prior.reference=ref AND prior.reverses_id IS NULL THEN
       RETURN prior.id;
     END IF;
   END IF;
   RAISE EXCEPTION 'Trust entries already exist for this sale. Review them in Trust & Bank; do not post a duplicate deposit';
 END IF;
 posted:=public.post_office_entry(p_account,d.id,p_day,'Client deposit received — firm sale',p_amount,ref,NULL);
 INSERT INTO public.transaction_audit_events(deal_id,actor_id,action,new_values)
 VALUES(d.id,auth.uid(),'Client deposit recorded in trust',jsonb_build_object('ledger_id',posted,'account_id',p_account,'amount',p_amount,'entry_date',p_day,'reference',ref));
 RETURN posted;
END $$;
REVOKE ALL ON FUNCTION public.rv102_record_trust_receipt(uuid,uuid,numeric,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv102_record_trust_receipt(uuid,uuid,numeric,date,text) TO authenticated;
COMMIT;
