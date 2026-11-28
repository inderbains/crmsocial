BEGIN;
CREATE OR REPLACE FUNCTION public.rv108_record_brokerage_share(p_deal uuid,p_day date,p_reference text,p_own_fees_confirmed boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deal_files; p public.agent_payouts; r public.office_ledger; a public.office_ledger; g public.office_ledger; t public.office_ledger; bal numeric; expected numeric; gid uuid; tid uuid; oid uuid; ref text:=btrim(coalesce(p_reference,'')); prev text;
BEGIN
 d:=public.rv108_admin(p_deal);
 IF d.rv_stage IS DISTINCT FROM 'Completed' OR d.rv_funds_verified IS NOT TRUE OR d.rv108_commission_receipt_id IS NULL OR d.rv_completed_date IS NULL OR p_day IS NULL OR p_day<d.rv_completed_date OR p_day>(now() AT TIME ZONE 'America/Vancouver')::date OR length(ref) NOT BETWEEN 4 AND 200 THEN RAISE EXCEPTION 'Record actual authorized earned brokerage transfer after completion'; END IF;
 SELECT * INTO p FROM public.agent_payouts WHERE deal_id=d.id AND brokerage_id=d.brokerage_id FOR UPDATE;
 IF NOT FOUND OR p.status IS DISTINCT FROM 'Paid' OR p.ledger_id IS NULL OR p.paid_date IS NULL OR p_day<p.paid_date OR p.net<=0 OR (p.deductions>0 AND p_own_fees_confirmed IS NOT TRUE) OR EXISTS(SELECT 1 FROM public.agent_deal_charges c WHERE c.deal_id=d.id AND c.category NOT IN ('Office fee','Office deduction') AND c.amount+c.gst>0) THEN RAISE EXCEPTION 'Record agent Trust payment first; deductions must belong solely to brokerage, not third-party remittances'; END IF;
 PERFORM id FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id ORDER BY id FOR UPDATE;
 r:=public.rv108_receipt(d);
 SELECT * INTO a FROM public.office_ledger l WHERE l.id=p.ledger_id AND l.deal_id=d.id AND l.account_id=r.account_id AND l.brokerage_id=d.brokerage_id AND l.amount=-p.net AND l.reverses_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.office_ledger x WHERE x.reverses_id=l.id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Agent Trust payment unavailable or reversed'; END IF;
 expected:=public.rv108_expected(d)-p.net;
 IF expected<0 THEN RAISE EXCEPTION 'Agent payment exceeds commission'; END IF;
 IF d.rv108_general_credit_id IS NOT NULL THEN
  SELECT * INTO g FROM public.office_ledger WHERE id=d.rv108_general_credit_id AND deal_id=d.id AND brokerage_id=d.brokerage_id;
  IF g.id IS NOT NULL AND g.amount=expected AND g.reference=ref AND g.entry_date=p_day AND NOT EXISTS(SELECT 1 FROM public.office_ledger x WHERE x.reverses_id=g.id) THEN RETURN g.id; END IF;
  RAISE EXCEPTION 'Brokerage transfer already recorded; review rather than repost';
 END IF;
 SELECT coalesce(sum(amount),0) INTO bal FROM public.office_ledger WHERE account_id=r.account_id AND deal_id=d.id AND brokerage_id=d.brokerage_id;
 IF bal<>expected OR (SELECT count(*) FROM public.office_ledger l WHERE l.brokerage_id=d.brokerage_id AND (l.deal_id=d.id OR l.deal_id=d.parent_listing_id))<>CASE WHEN d.rv108_lawyer_release_id IS NULL THEN 2 ELSE 3 END OR EXISTS(SELECT 1 FROM public.office_ledger l WHERE l.brokerage_id=d.brokerage_id AND (l.deal_id=d.id OR l.deal_id=d.parent_listing_id) AND (l.account_id<>r.account_id OR l.deal_id<>d.id OR l.reverses_id IS NOT NULL)) THEN RAISE EXCEPTION 'Unexpected ledger movements; accounting review required'; END IF;
 IF expected=0 THEN RETURN NULL; END IF;
 SELECT id INTO gid FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id AND kind='Operating' AND active AND rv105_default;
 IF gid IS NULL AND (SELECT count(*) FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id AND kind='Operating' AND active)=1 THEN SELECT id INTO gid FROM public.office_bank_accounts WHERE brokerage_id=d.brokerage_id AND kind='Operating' AND active; END IF;
 IF gid IS NULL THEN RAISE EXCEPTION 'Set default General account in Trust & Bank'; END IF;
 tid:=public.post_office_entry(r.account_id,d.id,p_day,'Earned brokerage share transferred to General',-expected,ref,NULL);
 oid:=public.post_office_entry(gid,d.id,p_day,'Earned brokerage share and authorized own fees from Trust',expected,ref,NULL);
 prev:=current_setting('realvolt.lifecycle_rpc',true); PERFORM set_config('realvolt.lifecycle_rpc','yes',true);
 UPDATE public.deal_files SET rv108_general_credit_id=oid WHERE id=d.id;
 PERFORM set_config('realvolt.lifecycle_rpc',coalesce(prev,'no'),true);
 INSERT INTO public.transaction_audit_events(deal_id,actor_id,action,new_values) VALUES(d.id,auth.uid(),'Earned brokerage share transferred to General',jsonb_build_object('trust_ledger_id',tid,'general_ledger_id',oid,'amount',expected,'reference',ref,'own_fees_confirmed',p_own_fees_confirmed));
 RETURN oid;
END; $$;
REVOKE ALL ON FUNCTION public.rv108_record_brokerage_share(uuid,date,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rv108_record_brokerage_share(uuid,date,text,boolean) TO authenticated;
COMMIT;
