BEGIN;
CREATE TABLE IF NOT EXISTS public.rv110_agent_charges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), brokerage_id uuid NOT NULL REFERENCES public.brokerages(id),
 profile_id uuid NOT NULL REFERENCES public.office_agents(id), charge_date date NOT NULL,
 category text NOT NULL CHECK(length(btrim(category)) BETWEEN 1 AND 100),
 description text NOT NULL CHECK(length(btrim(description)) BETWEEN 1 AND 300),
 invoice_ref text NOT NULL CHECK(length(btrim(invoice_ref)) BETWEEN 1 AND 200),
 amount numeric(15,2) NOT NULL CHECK(amount>0), gst numeric(15,2) NOT NULL CHECK(gst>=0),
 collection_method text NOT NULL CHECK(collection_method IN ('Commission deduction','Direct payment','Outstanding')),
 deal_charge_id uuid UNIQUE REFERENCES public.agent_deal_charges(id),
 receipt_ledger_id uuid UNIQUE REFERENCES public.office_ledger(id),
 void_reason text, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES auth.users(id),
 CHECK(num_nonnulls(deal_charge_id,receipt_ledger_id,void_reason)<=1),
 UNIQUE(profile_id,invoice_ref,category)
);
ALTER TABLE public.rv110_agent_charges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rv110_agent_charges FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.rv110_agent_charges TO authenticated;
DROP POLICY IF EXISTS rv110_charge_read ON public.rv110_agent_charges;
CREATE POLICY rv110_charge_read ON public.rv110_agent_charges FOR SELECT TO authenticated USING (
 (brokerage_id=public.current_brokerage() AND public.is_brokerage_admin(brokerage_id)) OR EXISTS(SELECT 1 FROM public.office_agents a WHERE a.id=profile_id AND a.brokerage_id=rv110_agent_charges.brokerage_id AND a.user_id=auth.uid())
);
DROP TRIGGER IF EXISTS rv110_charge_audit ON public.rv110_agent_charges;
CREATE TRIGGER rv110_charge_audit AFTER INSERT OR UPDATE ON public.rv110_agent_charges FOR EACH ROW EXECUTE FUNCTION public.audit_office_change();
CREATE OR REPLACE FUNCTION public.rv110_add_charge(p_profile uuid,p_day date,p_category text,p_description text,p_ref text,p_amount numeric,p_gst numeric,p_method text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.office_agents; rid uuid;
BEGIN
 SELECT * INTO a FROM public.office_agents WHERE id=p_profile FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR a.brokerage_id IS DISTINCT FROM public.current_brokerage() OR public.is_brokerage_admin(a.brokerage_id) IS NOT TRUE THEN RAISE EXCEPTION 'Agent profile unavailable'; END IF;
 IF p_day IS NULL OR p_day>(now() AT TIME ZONE 'America/Vancouver')::date OR EXISTS(SELECT 1 FROM public.office_periods WHERE brokerage_id=a.brokerage_id AND locked AND period_end>=p_day) THEN RAISE EXCEPTION 'Charge date is invalid or locked'; END IF;
 IF p_amount IS NULL OR p_gst IS NULL OR p_amount<=0 OR p_gst<0 OR p_amount<>round(p_amount,2) OR p_gst<>round(p_gst,2) THEN RAISE EXCEPTION 'Valid amount and actual GST required'; END IF;
 INSERT INTO public.rv110_agent_charges(brokerage_id,profile_id,charge_date,category,description,invoice_ref,amount,gst,collection_method,created_by) VALUES(a.brokerage_id,a.id,p_day,btrim(p_category),btrim(p_description),btrim(p_ref),p_amount,p_gst,p_method,auth.uid()) RETURNING id INTO rid;
 RETURN rid;
END; $$;
-- The existing authorization RPC already includes agent_deal_charges. Attach only a reviewed, brokerage-owed charge, before authorization.
CREATE OR REPLACE FUNCTION public.rv110_assign_charge(p_charge uuid,p_deal uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.deal_files; c public.rv110_agent_charges; a public.office_agents; rid uuid;
BEGIN
 SELECT * INTO d FROM public.deal_files WHERE id=p_deal FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR d.brokerage_id IS DISTINCT FROM public.current_brokerage() OR public.is_brokerage_admin(d.brokerage_id) IS NOT TRUE OR d.kind IS DISTINCT FROM 'Sale' OR d.review_status IS DISTINCT FROM 'Approved' OR d.rv_stage IS DISTINCT FROM 'Completed' OR d.rv_funds_verified IS NOT TRUE OR d.rv_completion_letter IS NULL THEN RAISE EXCEPTION 'Approved completed sale with confirmed funds required'; END IF;
 SELECT * INTO c FROM public.rv110_agent_charges WHERE id=p_charge AND brokerage_id=d.brokerage_id FOR UPDATE;
 IF NOT FOUND OR c.void_reason IS NOT NULL OR c.deal_charge_id IS NOT NULL OR c.receipt_ledger_id IS NOT NULL OR c.collection_method IS DISTINCT FROM 'Commission deduction' THEN RAISE EXCEPTION 'Outstanding commission-deduction charge required'; END IF;
 SELECT * INTO a FROM public.office_agents WHERE id=c.profile_id AND brokerage_id=d.brokerage_id AND user_id=d.user_id;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.agent_payouts WHERE deal_id=d.id) OR EXISTS(SELECT 1 FROM public.office_periods WHERE brokerage_id=d.brokerage_id AND locked AND period_end>=c.charge_date) THEN RAISE EXCEPTION 'Wrong agent, locked period or payout already authorized'; END IF;
 INSERT INTO public.agent_deal_charges(deal_id,category,description,amount,gst) VALUES(d.id,'Office fee',c.category||' — '||c.description||' ['||c.invoice_ref||']',c.amount,c.gst) RETURNING id INTO rid;
 UPDATE public.rv110_agent_charges SET deal_charge_id=rid WHERE id=c.id;
 RETURN rid;
END; $$;
-- Attach an already recorded, actual General receipt. Never post money again here.
CREATE OR REPLACE FUNCTION public.rv110_link_charge_receipt(p_charge uuid,p_ledger uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.rv110_agent_charges; l public.office_ledger;
BEGIN
 SELECT * INTO c FROM public.rv110_agent_charges WHERE id=p_charge FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR c.brokerage_id IS DISTINCT FROM public.current_brokerage() OR public.is_brokerage_admin(c.brokerage_id) IS NOT TRUE OR c.void_reason IS NOT NULL OR c.deal_charge_id IS NOT NULL OR c.receipt_ledger_id IS NOT NULL OR c.collection_method='Commission deduction' THEN RAISE EXCEPTION 'Outstanding direct-payment charge required'; END IF;
 SELECT * INTO l FROM public.office_ledger WHERE id=p_ledger AND brokerage_id=c.brokerage_id FOR UPDATE;
 IF NOT FOUND OR l.deal_id IS NOT NULL OR l.reverses_id IS NOT NULL OR l.amount IS DISTINCT FROM c.amount+c.gst OR l.entry_date<c.charge_date OR length(btrim(l.reference))=0 OR EXISTS(SELECT 1 FROM public.office_ledger WHERE reverses_id=l.id) OR NOT EXISTS(SELECT 1 FROM public.office_bank_accounts WHERE id=l.account_id AND brokerage_id=c.brokerage_id AND kind='Operating') THEN RAISE EXCEPTION 'Select the actual unreversed General receipt with matching amount and bank reference'; END IF;
 UPDATE public.rv110_agent_charges SET receipt_ledger_id=l.id WHERE id=c.id;
END; $$;
CREATE OR REPLACE FUNCTION public.rv110_void_charge(p_charge uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.rv110_agent_charges;
BEGIN
 SELECT * INTO c FROM public.rv110_agent_charges WHERE id=p_charge FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR c.brokerage_id IS DISTINCT FROM public.current_brokerage() OR public.is_brokerage_admin(c.brokerage_id) IS NOT TRUE OR num_nonnulls(c.deal_charge_id,c.receipt_ledger_id,c.void_reason)>0 OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 300 OR EXISTS(SELECT 1 FROM public.office_periods WHERE brokerage_id=c.brokerage_id AND locked AND period_end>=c.charge_date) THEN RAISE EXCEPTION 'Only unallocated, unpaid charges in an open period can be voided'; END IF;
 UPDATE public.rv110_agent_charges SET void_reason=btrim(p_reason) WHERE id=c.id;
END; $$;
CREATE OR REPLACE FUNCTION public.rv110_guard_linked_charge() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.rv110_agent_charges WHERE deal_charge_id=OLD.id) THEN RAISE EXCEPTION 'Linked agent charge cannot be edited or deleted; accounting review required'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rv110_lock_linked_charge ON public.agent_deal_charges;
CREATE TRIGGER rv110_lock_linked_charge BEFORE UPDATE OR DELETE ON public.agent_deal_charges FOR EACH ROW EXECUTE FUNCTION public.rv110_guard_linked_charge();
-- Agent-readable status projection. No access to other clients' bank ledgers or private data.
CREATE OR REPLACE FUNCTION public.rv110_charge_status(p_profile uuid) RETURNS TABLE(charge_id uuid,status text,paid_day date,payment_ref text,deal_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.id, CASE WHEN c.void_reason IS NOT NULL THEN 'Voided' WHEN l.id IS NOT NULL AND EXISTS(SELECT 1 FROM public.office_ledger x WHERE x.reverses_id=l.id) THEN 'Receipt reversed — review' WHEN l.id IS NOT NULL THEN 'Paid' WHEN p.status='Paid' THEN 'Paid' WHEN p.status='Authorized' THEN 'Authorized' WHEN dc.id IS NOT NULL THEN 'Assigned to commission' ELSE 'Outstanding' END,
 CASE WHEN l.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.office_ledger x WHERE x.reverses_id=l.id) THEN l.entry_date WHEN p.status='Paid' THEN p.paid_date ELSE NULL END,
 CASE WHEN l.id IS NOT NULL THEN l.reference ELSE p.payment_reference END,dc.deal_id
 FROM public.rv110_agent_charges c JOIN public.office_agents a ON a.id=c.profile_id AND a.brokerage_id=c.brokerage_id
 LEFT JOIN public.agent_deal_charges dc ON dc.id=c.deal_charge_id LEFT JOIN public.agent_payouts p ON p.deal_id=dc.deal_id AND p.profile_id=c.profile_id AND p.brokerage_id=c.brokerage_id LEFT JOIN public.office_ledger l ON l.id=c.receipt_ledger_id AND l.brokerage_id=c.brokerage_id
 WHERE c.profile_id=p_profile AND auth.uid() IS NOT NULL AND (a.user_id=auth.uid() OR (c.brokerage_id=public.current_brokerage() AND public.is_brokerage_admin(c.brokerage_id)));
$$;
REVOKE ALL ON FUNCTION public.rv110_add_charge(uuid,date,text,text,text,numeric,numeric,text),public.rv110_assign_charge(uuid,uuid),public.rv110_link_charge_receipt(uuid,uuid),public.rv110_void_charge(uuid,text),public.rv110_charge_status(uuid),public.rv110_guard_linked_charge() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rv110_add_charge(uuid,date,text,text,text,numeric,numeric,text),public.rv110_assign_charge(uuid,uuid),public.rv110_link_charge_receipt(uuid,uuid),public.rv110_void_charge(uuid,text),public.rv110_charge_status(uuid) TO authenticated;
COMMIT;
