BEGIN;
CREATE OR REPLACE FUNCTION public.rv_brokerage_eligible_093(p_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE u auth.users;
BEGIN
 SELECT * INTO u FROM auth.users WHERE id=auth.uid();
 IF NOT FOUND OR u.email_confirmed_at IS NULL OR coalesce(u.banned_until>now(),false) OR lower(coalesce(u.email,'')) IS DISTINCT FROM lower(btrim(coalesce(p_email,''))) THEN RETURN false; END IF;
 RETURN NOT EXISTS(SELECT 1 FROM rv_platform_private.admins WHERE user_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM public.brokerage_members WHERE user_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM public.office_agents WHERE user_id=u.id OR (lower(email)=lower(u.email) AND status='Invited' AND invitation_expires_at>=now()))
 AND NOT EXISTS(SELECT 1 FROM rv_platform_private.plan_assignments WHERE user_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM rv_platform_private.account_reviews WHERE user_id=u.id);
END $$;
REVOKE ALL ON FUNCTION public.rv_brokerage_eligible_093(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rv_brokerage_eligible_093(text) TO authenticated;
COMMIT;
