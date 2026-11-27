-- RealVolt 091: dedicated self-service brokerage onboarding. Run after 088–090.
-- No deletion, charges, role changes to existing memberships, or transfer of private files.
BEGIN;
CREATE OR REPLACE FUNCTION public.rv_register_brokerage_091(p_name text,p_admin_name text,p_expected_email text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u auth.users; b uuid; n text:=btrim(coalesce(p_name,'')); a text:=btrim(coalesce(p_admin_name,''));
BEGIN
 SELECT * INTO u FROM auth.users WHERE id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR u.email_confirmed_at IS NULL OR coalesce(u.banned_until>now(),false) OR lower(coalesce(u.email,'')) IS DISTINCT FROM lower(btrim(coalesce(p_expected_email,''))) THEN
   RAISE EXCEPTION 'Sign in with the verified account you intend to register' USING ERRCODE='42501';
 END IF;
 IF EXISTS(SELECT 1 FROM rv_platform_private.admins WHERE user_id=u.id) THEN RAISE EXCEPTION 'Use a separate email for your brokerage account'; END IF;
 IF EXISTS(SELECT 1 FROM public.brokerage_members WHERE user_id=u.id) THEN RAISE EXCEPTION 'This account already belongs to a brokerage'; END IF;
 IF EXISTS(SELECT 1 FROM public.office_agents WHERE user_id=u.id OR (lower(email)=lower(u.email) AND status='Invited' AND invitation_expires_at>=now())) THEN RAISE EXCEPTION 'Existing agent profile or invitation. Contact your brokerage or use a different email'; END IF;
 IF EXISTS(SELECT 1 FROM rv_platform_private.plan_assignments WHERE user_id=u.id) THEN RAISE EXCEPTION 'Existing individual subscription. Ask platform support to review the change'; END IF;
 IF EXISTS(SELECT 1 FROM rv_platform_private.account_reviews WHERE user_id=u.id) THEN RAISE EXCEPTION 'Account is under deletion review'; END IF;
 IF char_length(n) NOT BETWEEN 1 AND 100 OR char_length(a) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION 'Enter a valid brokerage name and administrator name'; END IF;
 INSERT INTO public.brokerages(name,email) VALUES(n,lower(u.email)) RETURNING id INTO b;
 INSERT INTO public.brokerage_members(user_id,brokerage_id,role) VALUES(u.id,b,'admin');
 INSERT INTO public.agent_workspace_profiles(user_id,full_name) VALUES(u.id,a) ON CONFLICT(user_id) DO UPDATE SET full_name=excluded.full_name;
 INSERT INTO public.workspace_settings(user_id,name,kind) VALUES(u.id,n,'brokerage') ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,kind='brokerage',updated_at=now();
 RETURN b;
END $$;
REVOKE ALL ON FUNCTION public.rv_register_brokerage_091(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rv_register_brokerage_091(text,text,text) TO authenticated;
-- Retire the legacy self-service endpoint that did not enforce verified email or owner separation.
REVOKE ALL ON FUNCTION public.create_own_brokerage(text,text) FROM PUBLIC,anon,authenticated;
COMMIT;
