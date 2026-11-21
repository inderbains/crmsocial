-- RealVolt 031: additive CRM qualification, evidence-based deal milestones and safe reminders.
-- Requires 003,004,023,030, and rvcrm_20261118_real_estate_phase1.sql.
-- Apply on staging first. No existing tables/rows are dropped.
BEGIN;

CREATE TABLE IF NOT EXISTS public.rvcrm_deal_milestones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
 deal_id uuid NOT NULL REFERENCES public.deal_files(id) ON DELETE CASCADE,
 event_type text NOT NULL CHECK (event_type IN ('Offer submitted','Firm contract','Completion confirmed')),
 evidence_note text NOT NULL CHECK (length(trim(evidence_note)) BETWEEN 10 AND 2000),
 occurred_on date NOT NULL DEFAULT current_date,
 previous_stage text NOT NULL DEFAULT '',
 resulting_stage text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rvcrm_milestones_owner_created ON public.rvcrm_deal_milestones(user_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS rvcrm_single_firm_completion ON public.rvcrm_deal_milestones(contact_id,deal_id,event_type)
 WHERE event_type IN ('Firm contract','Completion confirmed');
ALTER TABLE public.rvcrm_deal_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rvcrm_milestones_owner_read ON public.rvcrm_deal_milestones;
CREATE POLICY rvcrm_milestones_owner_read ON public.rvcrm_deal_milestones
 FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS rvcrm_milestones_owner_insert ON public.rvcrm_deal_milestones;
CREATE POLICY rvcrm_milestones_owner_insert ON public.rvcrm_deal_milestones
 FOR INSERT TO authenticated WITH CHECK (user_id=(SELECT auth.uid()));
REVOKE ALL ON public.rvcrm_deal_milestones FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.rvcrm_deal_milestones TO authenticated;
GRANT ALL ON public.rvcrm_deal_milestones TO service_role;

-- The contact must be linked to the agent-owned deal in the EXISTING CRM.
-- A deal being Approved by back office is NOT proof of firm subject removal or completion.
CREATE OR REPLACE FUNCTION public.rvcrm_record_milestone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_stage text; v_completion date; v_next text;
BEGIN
 IF NEW.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Milestone owner mismatch'; END IF;
 IF NEW.occurred_on > current_date THEN RAISE EXCEPTION 'Future milestones cannot be confirmed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.rvcrm_contact_deals l
       WHERE l.user_id=NEW.user_id AND l.contact_id=NEW.contact_id AND l.deal_id=NEW.deal_id) THEN
   RAISE EXCEPTION 'Contact is not linked to this transaction';
 END IF;
 SELECT d.completion_date INTO v_completion FROM public.deal_files d
       WHERE d.id=NEW.deal_id AND d.user_id=NEW.user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
 SELECT stage INTO v_stage FROM public.crm_contacts
       WHERE id=NEW.contact_id AND user_id=NEW.user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Contact not found'; END IF;
 IF v_stage IN ('Closed','Lost') THEN RAISE EXCEPTION 'Closed or lost contacts cannot receive milestones'; END IF;
 IF NEW.event_type='Offer submitted' THEN
    v_next:=CASE WHEN v_stage IN ('New','Contacted','Qualified') THEN 'Active' ELSE v_stage END;
 ELSIF NEW.event_type='Firm contract' THEN
    v_next:='Under contract';
 ELSIF NEW.event_type='Completion confirmed' THEN
    IF v_stage <> 'Under contract' THEN RAISE EXCEPTION 'Confirm firm contract before closing'; END IF;
    IF v_completion IS NULL OR v_completion>current_date OR v_completion>NEW.occurred_on THEN
       RAISE EXCEPTION 'Set and verify a completed completion date in Transactions first';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.rvcrm_deal_milestones m
       WHERE m.user_id=NEW.user_id AND m.contact_id=NEW.contact_id
         AND m.deal_id=NEW.deal_id AND m.event_type='Firm contract') THEN
       RAISE EXCEPTION 'Firm contract milestone missing for this transaction';
    END IF;
    v_next:='Closed';
 ELSE RAISE EXCEPTION 'Unsupported milestone'; END IF;
 NEW.previous_stage:=v_stage; NEW.resulting_stage:=v_next;
 IF v_stage IS DISTINCT FROM v_next THEN
   UPDATE public.crm_contacts SET stage=v_next WHERE id=NEW.contact_id AND user_id=NEW.user_id;
 END IF;
 IF NEW.event_type='Completion confirmed' THEN
   INSERT INTO public.crm_tasks(user_id,contact_id,title,due_date,priority)
   VALUES(NEW.user_id,NEW.contact_id,'Post-sale client check-in',CURRENT_DATE+7,'Normal');
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rvcrm_milestone_record ON public.rvcrm_deal_milestones;
CREATE TRIGGER rvcrm_milestone_record BEFORE INSERT ON public.rvcrm_deal_milestones
 FOR EACH ROW EXECUTE FUNCTION public.rvcrm_record_milestone();
REVOKE ALL ON FUNCTION public.rvcrm_record_milestone() FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.rvcrm_qualification_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
 reason text NOT NULL DEFAULT 'Complete documented qualification fields',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rvcrm_qualifications_owner ON public.rvcrm_qualification_audit(user_id,created_at DESC);
ALTER TABLE public.rvcrm_qualification_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rvcrm_qualifications_read ON public.rvcrm_qualification_audit;
CREATE POLICY rvcrm_qualifications_read ON public.rvcrm_qualification_audit FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()));
REVOKE ALL ON public.rvcrm_qualification_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.rvcrm_qualification_audit TO authenticated;
GRANT ALL ON public.rvcrm_qualification_audit TO service_role;

-- Qualification is a conservative RULE, not an AI assertion of lender approval.
-- Only a Contacted lead can become Qualified; no retroactive closure or regression.
CREATE OR REPLACE FUNCTION public.rvcrm_maybe_qualify(p_owner uuid,p_contact uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.crm_contacts%ROWTYPE; p public.rvcrm_real_estate_profiles%ROWTYPE; v_area boolean;
BEGIN
 SELECT * INTO c FROM public.crm_contacts
 WHERE id=p_contact AND user_id=p_owner AND stage='Contacted' FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 SELECT * INTO p FROM public.rvcrm_real_estate_profiles
 WHERE contact_id=c.id AND user_id=c.user_id;
 IF NOT FOUND THEN RETURN; END IF;
 v_area := length(trim(c.preferred_area))>0 OR cardinality(p.preferred_areas)>0;
 IF NOT v_area OR length(trim(p.purchase_timeline))=0 THEN RETURN; END IF;
 IF c.contact_type IN ('Buyer','Buyer & seller') THEN
   IF c.budget IS NULL OR c.budget<=0 OR length(trim(p.financing_status))=0 THEN RETURN; END IF;
 ELSIF c.contact_type='Seller' THEN
   IF length(trim(p.motivation))=0 THEN RETURN; END IF;
 ELSE RETURN; END IF;
 UPDATE public.crm_contacts SET stage='Qualified'
 WHERE id=p_contact AND user_id=p_owner AND stage='Contacted';
 IF FOUND THEN
   INSERT INTO public.rvcrm_qualification_audit(user_id,contact_id) VALUES(p_owner,p_contact);
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.rvcrm_check_qualification_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='crm_contacts' THEN PERFORM public.rvcrm_maybe_qualify(NEW.user_id,NEW.id);
 ELSE PERFORM public.rvcrm_maybe_qualify(NEW.user_id,NEW.contact_id); END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS rvcrm_qualify_after_contact ON public.crm_contacts;
CREATE TRIGGER rvcrm_qualify_after_contact AFTER UPDATE OF stage,preferred_area,budget ON public.crm_contacts
 FOR EACH ROW EXECUTE FUNCTION public.rvcrm_check_qualification_trigger();
DROP TRIGGER IF EXISTS rvcrm_qualify_after_profile ON public.rvcrm_real_estate_profiles;
CREATE TRIGGER rvcrm_qualify_after_profile AFTER INSERT OR UPDATE ON public.rvcrm_real_estate_profiles
 FOR EACH ROW EXECUTE FUNCTION public.rvcrm_check_qualification_trigger();
REVOKE ALL ON FUNCTION public.rvcrm_maybe_qualify(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.rvcrm_check_qualification_trigger() FROM PUBLIC,anon,authenticated;

CREATE TABLE IF NOT EXISTS public.rvcrm_followup_nudges (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 contact_id uuid NOT NULL REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
 nudged_on date NOT NULL DEFAULT current_date,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(contact_id,nudged_on)
);
CREATE INDEX IF NOT EXISTS rvcrm_nudges_by_owner ON public.rvcrm_followup_nudges(user_id,created_at DESC);
ALTER TABLE public.rvcrm_followup_nudges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rvcrm_nudges_read ON public.rvcrm_followup_nudges;
CREATE POLICY rvcrm_nudges_read ON public.rvcrm_followup_nudges FOR SELECT TO authenticated
 USING(user_id=(SELECT auth.uid()));
REVOKE ALL ON public.rvcrm_followup_nudges FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.rvcrm_followup_nudges TO authenticated;
GRANT ALL ON public.rvcrm_followup_nudges TO service_role;

-- Called exclusively by the authenticated server cron, NEVER by browsers.
-- Suppress repeats if a task remains open; create one reminder after inactivity.
CREATE OR REPLACE FUNCTION public.rvcrm_schedule_followups(p_limit integer DEFAULT 25)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c record; v_created integer:=0; v_id bigint;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service role only'; END IF;
 IF NOT pg_try_advisory_xact_lock(19408211) THEN RETURN 0; END IF;
 FOR c IN
   SELECT ct.id,ct.user_id,ct.full_name FROM public.crm_contacts ct
   LEFT JOIN public.rvcrm_real_estate_profiles rp ON rp.contact_id=ct.id AND rp.user_id=ct.user_id
   WHERE ct.stage IN ('New','Contacted','Qualified','Active')
     AND NOT EXISTS (SELECT 1 FROM public.crm_tasks t WHERE t.contact_id=ct.id AND t.user_id=ct.user_id AND NOT t.completed)
     AND COALESCE((SELECT MAX(n.created_at) FROM public.crm_notes n WHERE n.contact_id=ct.id AND n.user_id=ct.user_id),ct.created_at)
       <= now() - make_interval(days=>COALESCE(rp.followup_cadence_days,7))
     AND COALESCE((SELECT MAX(f.created_at) FROM public.rvcrm_followup_nudges f WHERE f.contact_id=ct.id),ct.created_at)
       <= now() - make_interval(days=>COALESCE(rp.followup_cadence_days,7))
   ORDER BY ct.updated_at ASC LIMIT LEAST(GREATEST(p_limit,1),50)
   FOR UPDATE OF ct SKIP LOCKED
 LOOP
   INSERT INTO public.rvcrm_followup_nudges(user_id,contact_id)
     VALUES(c.user_id,c.id) ON CONFLICT DO NOTHING RETURNING id INTO v_id;
   IF v_id IS NOT NULL THEN
     INSERT INTO public.crm_tasks(user_id,contact_id,title,due_date,priority)
       VALUES(c.user_id,c.id,'Reconnect with '||left(c.full_name,180),current_date,'Normal');
     v_created:=v_created+1;
   END IF;
   v_id:=NULL;
 END LOOP;
 RETURN v_created;
END $$;
REVOKE ALL ON FUNCTION public.rvcrm_schedule_followups(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rvcrm_schedule_followups(integer) TO service_role;
COMMIT;
