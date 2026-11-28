BEGIN;
CREATE OR REPLACE FUNCTION public.rv105_record_received_deposit(p_deal uuid,p_received_on date)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deal_files; proof uuid; prev text;
BEGIN
 SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR d.user_id IS DISTINCT FROM auth.uid() OR d.brokerage_id IS NULL OR d.brokerage_id IS DISTINCT FROM public.current_brokerage()
 OR d.kind IS DISTINCT FROM 'Sale' OR d.rv_stage IS DISTINCT FROM 'Sold' OR coalesce(d.review_status,'') NOT IN ('Submitted','Approved','Changes requested') OR d.rv_deleted_at IS NOT NULL OR d.deposit_holder IS DISTINCT FROM 'our_brokerage'
 OR d.deposit_amount IS NULL OR d.deposit_amount<=0 OR d.deposit_amount<>round(d.deposit_amount,2) THEN RAISE EXCEPTION 'Only the owner of a submitted firm sale with an internal deposit can record receipt'; END IF;
 IF p_received_on IS NULL OR p_received_on>(now() AT TIME ZONE 'America/Vancouver')::date THEN RAISE EXCEPTION 'Enter the actual date funds were received into Trust, not a future date'; END IF;
 IF d.rv105_received_on IS NOT NULL THEN
   IF d.rv105_received_on IS DISTINCT FROM p_received_on THEN RAISE EXCEPTION 'Receipt date is already recorded; contact Back Office for corrections'; END IF;
   RETURN public.rv105_post_saved_receipt(d.id);
 END IF;
 SELECT doc.id INTO proof FROM public.deal_requirements r JOIN public.deal_documents doc ON doc.id=r.document_id AND doc.deal_id=d.id JOIN storage.objects o ON o.bucket_id='transaction-files' AND o.name=doc.path
 WHERE r.deal_id=d.id AND r.label='Deposit cheque copy / deposit receipt' AND NOT coalesce(r.rv_waived,false);
 IF proof IS NULL THEN RAISE EXCEPTION 'Attach the actual deposit cheque copy or receipt before recording funds'; END IF;
 prev:=current_setting('realvolt.lifecycle_rpc',true);
 PERFORM set_config('realvolt.lifecycle_rpc','yes',true);
 UPDATE public.deal_files SET rv105_received_on=p_received_on,rv105_receipt_document=proof,rv105_receipt_status='pending' WHERE id=d.id;
 PERFORM set_config('realvolt.lifecycle_rpc',coalesce(prev,'no'),true);
 INSERT INTO public.transaction_audit_events(deal_id,actor_id,action,new_values) VALUES(d.id,auth.uid(),'Agent recorded actual trust deposit receipt',jsonb_build_object('amount',d.deposit_amount,'received_on',p_received_on,'document_id',proof));
 RETURN public.rv105_post_saved_receipt(d.id);
END; $$;
REVOKE ALL ON FUNCTION public.rv105_record_received_deposit(uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv105_record_received_deposit(uuid,date) TO authenticated;
CREATE OR REPLACE FUNCTION public.rv105_retry_saved_receipt(p_deal uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Reuse locked saved facts only. No bank selection, new amount or receipt date.
 RETURN public.rv105_post_saved_receipt(p_deal);
END; $$;
REVOKE ALL ON FUNCTION public.rv105_retry_saved_receipt(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv105_retry_saved_receipt(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.rv105_submit_firm_with_receipt(p_deal uuid,p_date date,p_document uuid,p_outcome text,p_buyer_lawyer uuid,p_seller_lawyer uuid,p_listing_commission numeric,p_selling_commission numeric,p_gst_rate numeric,p_deposit_amount numeric,p_deposit_holder text,p_deposit_brokerage text,p_received_on date)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_received_on IS NOT NULL AND (p_deposit_holder IS DISTINCT FROM 'our_brokerage' OR coalesce(p_deposit_amount,0)<=0) THEN RAISE EXCEPTION 'Only received internal Trust deposits may be posted'; END IF;
 PERFORM public.rv059_submit_firm_with_details(p_deal,p_date,p_document,p_outcome,p_buyer_lawyer,p_seller_lawyer,p_listing_commission,p_selling_commission,p_gst_rate,p_deposit_amount,p_deposit_holder,p_deposit_brokerage);
 IF p_received_on IS NULL THEN RETURN 'not_recorded'; END IF;
 RETURN public.rv105_record_received_deposit(p_deal,p_received_on);
END; $$;
REVOKE ALL ON FUNCTION public.rv105_submit_firm_with_receipt(uuid,date,uuid,text,uuid,uuid,numeric,numeric,numeric,numeric,text,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv105_submit_firm_with_receipt(uuid,date,uuid,text,uuid,uuid,numeric,numeric,numeric,numeric,text,text,date) TO authenticated;
COMMIT;
