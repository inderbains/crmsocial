BEGIN;
CREATE OR REPLACE FUNCTION public.rv108_record_lawyer_release(p_deal uuid,p_side text,p_day date,p_reference text,p_authorization text,p_amount numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deal_files; r public.office_ledger; old public.office_ledger; payee text; ref text:=btrim(coalesce(p_reference,'')); authref text:=btrim(coalesce(p_authorization,'')); n integer; expected numeric; posted uuid; prev text;
BEGIN
 d:=public.rv108_admin(p_deal);
 IF d.deposit_holder IS DISTINCT FROM 'our_brokerage' OR d.rv_stage NOT IN ('Sold','Completed') OR d.rv_funds_verified OR d.rv106_trust_transfer_id IS NOT NULL OR d.rv106_general_transfer_id IS NOT NULL THEN RAISE EXCEPTION 'Use before legal completion/commission settlement; legacy transfers require accounting review'; END IF;
 IF p_side IS NULL OR p_side NOT IN ('buyer','seller') OR p_day IS NULL OR p_day>(now() AT TIME ZONE 'America/Vancouver')::date OR (d.rv_stage='Completed' AND (d.rv_completed_date IS NULL OR p_day>d.rv_completed_date)) OR length(ref) NOT BETWEEN 4 AND 200 OR length(authref) NOT BETWEEN 4 AND 500 THEN RAISE EXCEPTION 'Actual authorized pre-completion lawyer payment date and references required'; END IF;
 payee:=btrim(coalesce((CASE WHEN p_side='buyer' THEN d.buyer_lawyer ELSE d.seller_lawyer END)->>'name',''));
 IF payee='' THEN RAISE EXCEPTION 'Save the authorized lawyer on this sale'; END IF;
 PERFORM id FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id ORDER BY id FOR UPDATE;
 r:=public.rv108_receipt(d); expected:=r.amount-public.rv108_expected(d);
 IF expected<=0 OR p_amount IS DISTINCT FROM expected OR p_day<r.entry_date THEN RAISE EXCEPTION 'Release must equal full deposit minus retained own-side commission and GST, and cannot predate receipt'; END IF;
 IF d.rv108_lawyer_release_id IS NOT NULL THEN
  SELECT * INTO old FROM public.office_ledger WHERE id=d.rv108_lawyer_release_id AND brokerage_id=d.brokerage_id AND deal_id=d.id AND account_id=r.account_id;
  IF old.id IS NOT NULL AND old.amount=-expected AND old.reference=ref AND old.entry_date=p_day AND NOT EXISTS(SELECT 1 FROM public.office_ledger x WHERE x.reverses_id=old.id) AND EXISTS(SELECT 1 FROM public.transaction_audit_events e WHERE e.deal_id=d.id AND e.action='Authorized pre-completion lawyer disbursement' AND e.new_values->>'ledger_id'=old.id::text AND e.new_values->>'side'=p_side AND e.new_values->>'payee'=payee AND e.new_values->>'authorization'=authref) THEN RETURN old.id; END IF;
  RAISE EXCEPTION 'Lawyer release already recorded or corrected; do not post again';
 END IF;
 SELECT count(*) INTO n FROM public.office_ledger l WHERE l.brokerage_id=d.brokerage_id AND (l.deal_id=d.id OR l.deal_id=d.parent_listing_id);
 IF n<>1 OR EXISTS(SELECT 1 FROM public.office_cheques c WHERE c.deal_id=d.id AND c.status<>'Voided') THEN RAISE EXCEPTION 'Other ledger movements or cheque records exist; review accounting, do not duplicate'; END IF;
 posted:=public.post_office_entry(r.account_id,d.id,p_day,'Authorized pre-completion lawyer disbursement to '||payee,-expected,ref,NULL);
 prev:=current_setting('realvolt.lifecycle_rpc',true); PERFORM set_config('realvolt.lifecycle_rpc','yes',true);
 UPDATE public.deal_files SET rv108_lawyer_release_id=posted WHERE id=d.id;
 PERFORM set_config('realvolt.lifecycle_rpc',coalesce(prev,'no'),true);
 INSERT INTO public.transaction_audit_events(deal_id,actor_id,action,new_values) VALUES(d.id,auth.uid(),'Authorized pre-completion lawyer disbursement',jsonb_build_object('ledger_id',posted,'account_id',r.account_id,'side',p_side,'payee',payee,'authorization',authref,'reference',ref,'amount',expected,'retained_commission',public.rv108_expected(d),'entry_date',p_day));
 RETURN posted;
END; $$;
REVOKE ALL ON FUNCTION public.rv108_record_lawyer_release(uuid,text,date,text,text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv108_record_lawyer_release(uuid,text,date,text,text,numeric) TO authenticated;
COMMIT;
