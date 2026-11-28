BEGIN;
CREATE OR REPLACE FUNCTION public.rv114_archive_agent(p_profile uuid,p_expected_status text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.office_agents; b uuid:=public.current_brokerage(); today date:=(now() AT TIME ZONE 'America/Vancouver')::date;
BEGIN
 IF auth.uid() IS NULL OR b IS NULL OR NOT public.is_brokerage_admin(b) THEN RAISE EXCEPTION 'Brokerage admin required'; END IF;
 IF coalesce(length(trim(p_reason)),0)=0 OR length(p_reason)>1000 THEN RAISE EXCEPTION 'Enter a removal reason (maximum 1000 characters)'; END IF;
 PERFORM 1 FROM public.brokerages WHERE id=b FOR UPDATE;
 SELECT * INTO p FROM public.office_agents WHERE id=p_profile AND brokerage_id=b FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agent not found in this brokerage'; END IF;
 IF p.status IS DISTINCT FROM p_expected_status OR p.status NOT IN ('Active','Invited') THEN RAISE EXCEPTION 'Agent status changed. Refresh and review again'; END IF;
 IF p.user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.brokerage_members m WHERE m.brokerage_id=b AND m.user_id=p.user_id AND m.role='admin') THEN RAISE EXCEPTION 'Administrator offboarding requires separate review'; END IF;
 IF EXISTS(SELECT 1 FROM public.office_agents a WHERE a.brokerage_id=b AND a.reviewer_id=p.user_id AND a.id<>p.id AND a.status<>'Inactive') THEN RAISE EXCEPTION 'Reassign agent reviews first'; END IF;
 IF EXISTS(SELECT 1 FROM public.agent_card_accounts c WHERE c.profile_id=p.id AND c.subscription_id IS NOT NULL) THEN RAISE EXCEPTION 'Cancel and reconcile the existing card subscription first'; END IF;
 IF p.status='Active' THEN
  IF EXISTS(SELECT 1 FROM public.rv_tx_summary t WHERE t.brokerage_id=b AND t.user_id=p.user_id AND t.review_status<>'Draft' AND ((t.kind='Sale' AND (t.rv_stage IS NULL OR t.rv_stage NOT IN ('Archived','Collapsed') OR t.review_status<>'Approved')) OR (t.kind='Listing' AND t.display_status NOT IN ('Expired','Terminated','Sold')))) THEN RAISE EXCEPTION 'Resolve or hand over open submitted transactions before removing this agent'; END IF;
  IF EXISTS(SELECT 1 FROM public.agent_payouts a WHERE a.profile_id=p.id AND a.status='Authorized') THEN RAISE EXCEPTION 'Resolve authorized commission payments first'; END IF;
  IF p.start_date>today THEN RAISE EXCEPTION 'Review the future start date before deactivation'; END IF;
  UPDATE public.office_agents SET status='Inactive',end_date=least(coalesce(p.end_date,today),today) WHERE id=p.id;
 ELSE
  IF p.user_id IS NOT NULL THEN RAISE EXCEPTION 'Invitation is linked to an account; review manually'; END IF;
  UPDATE public.office_agents SET status='Inactive',invitation_expires_at=now() WHERE id=p.id;
 END IF;
 INSERT INTO public.office_audit_events(brokerage_id,actor_id,action,record_id,new_values) VALUES(b,auth.uid(),'rv114_agent_archived',p.id::text,jsonb_build_object('previous_status',p.status,'reason',trim(p_reason)));
END $$;
REVOKE ALL ON FUNCTION public.rv114_archive_agent(uuid,text,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.rv114_archive_agent(uuid,text,text) TO authenticated;
COMMIT;
