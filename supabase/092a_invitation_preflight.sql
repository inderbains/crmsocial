-- Requires 081, 083, 084, 088 and 091. Apply in staging first.
BEGIN;
-- Internal predicate: service-created Auth identity must be bound to this exact invitation.
CREATE OR REPLACE FUNCTION rv_platform_private.invite_identity_ok_092(p_user uuid,p_profile uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users u JOIN public.office_agents a ON a.id=p_profile
 WHERE u.id=p_user AND lower(trim(u.email))=a.email
 AND u.raw_app_meta_data->>'rv_invite_profile'=a.id::text
 AND NOT coalesce(u.banned_until>now(),false)
 AND NOT EXISTS(SELECT 1 FROM public.brokerage_members m WHERE m.user_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM rv_platform_private.admins m WHERE m.user_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM rv_platform_private.plan_assignments m WHERE m.user_id=u.id)
 AND NOT EXISTS(SELECT 1 FROM rv_platform_private.account_reviews m WHERE m.user_id=u.id));
$$;
REVOKE ALL ON FUNCTION rv_platform_private.invite_identity_ok_092(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.rv_invitation_preflight_092(p_profile uuid,p_admin uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.office_agents; uid uuid;
BEGIN
 SELECT * INTO a FROM public.office_agents WHERE id=p_profile AND status='Invited' AND user_id IS NULL;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.brokerage_members m WHERE m.user_id=p_admin AND m.brokerage_id=a.brokerage_id AND m.role='admin') THEN RAISE EXCEPTION 'Invitation unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM public.office_agents x WHERE x.id<>a.id AND lower(x.email)=lower(a.email) AND (x.user_id IS NOT NULL OR (x.status='Invited' AND x.invitation_expires_at>=now()))) THEN RAISE EXCEPTION 'Conflicting agent record'; END IF;
 SELECT u.id INTO uid FROM auth.users u WHERE lower(trim(u.email))=a.email;
 IF uid IS NOT NULL AND NOT rv_platform_private.invite_identity_ok_092(uid,a.id) THEN RAISE EXCEPTION 'Existing account'; END IF;
 RETURN uid;
END $$;
REVOKE ALL ON FUNCTION public.rv_invitation_preflight_092(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rv_invitation_preflight_092(uuid,uuid) TO service_role;

COMMIT;
