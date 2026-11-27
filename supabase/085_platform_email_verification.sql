-- Requires Fix 084. Does not change normal workspace authentication.
BEGIN;
CREATE TABLE IF NOT EXISTS rv_platform_private.email_challenges (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 session_id uuid NOT NULL, salt uuid NOT NULL, digest bytea NOT NULL,
 issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0, verified_until timestamptz,
 window_started timestamptz NOT NULL DEFAULT now(), issues_in_window integer NOT NULL DEFAULT 1
);
ALTER TABLE rv_platform_private.email_challenges ADD COLUMN IF NOT EXISTS window_started timestamptz NOT NULL DEFAULT now(), ADD COLUMN IF NOT EXISTS issues_in_window integer NOT NULL DEFAULT 1;
ALTER TABLE rv_platform_private.email_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rv_platform_private.email_challenges FROM PUBLIC, anon, authenticated, service_role;
-- Server-side session checks; never accept an email or user id from the browser.
CREATE OR REPLACE FUNCTION public.rv_platform_email_context() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.rv_platform_admin_allowed()
 AND coalesce(auth.jwt()->'amr' @> '[{"method":"password"}]'::jsonb,false)
 AND EXISTS (SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id
 WHERE s.id::text=auth.jwt()->>'session_id' AND s.user_id=auth.uid()
 AND (s.not_after IS NULL OR s.not_after>now()) AND (u.banned_until IS NULL OR u.banned_until<=now()));
$$;
REVOKE ALL ON FUNCTION public.rv_platform_email_context() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rv_platform_email_context() TO authenticated;
CREATE OR REPLACE FUNCTION public.rv_platform_email_issue(p_user uuid,p_session uuid,p_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_issue timestamptz; window_start timestamptz; issue_count integer; new_salt uuid:=pg_catalog.gen_random_uuid();
BEGIN
 IF p_code IS NULL OR p_code !~ '^[0-9]{6}$' OR NOT EXISTS (
 SELECT 1 FROM rv_platform_private.admins a JOIN auth.users u ON u.id=a.user_id JOIN auth.sessions s ON s.user_id=u.id
 WHERE a.user_id=p_user AND s.id=p_session AND lower(u.email)='inderbains@gmail.com' AND u.email_confirmed_at IS NOT NULL
 AND (u.banned_until IS NULL OR u.banned_until<=now()) AND (s.not_after IS NULL OR s.not_after>now())) THEN RETURN false; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user::text,85));
 SELECT issued_at,window_started,issues_in_window INTO old_issue,window_start,issue_count FROM rv_platform_private.email_challenges WHERE user_id=p_user;
 IF old_issue>now()-interval '60 seconds' THEN RETURN false; END IF;
 IF window_start IS NULL OR window_start<=now()-interval '1 hour' THEN window_start:=now();issue_count:=0; END IF;
 IF issue_count>=5 THEN RETURN false; END IF;
 INSERT INTO rv_platform_private.email_challenges(user_id,session_id,salt,digest,issued_at,expires_at,attempts,verified_until,window_started,issues_in_window)
 VALUES(p_user,p_session,new_salt,pg_catalog.sha256(pg_catalog.convert_to(new_salt::text||':'||p_code,'UTF8')),now(),now()+interval '10 minutes',0,NULL,window_start,issue_count+1)
 ON CONFLICT(user_id) DO UPDATE SET session_id=excluded.session_id,salt=excluded.salt,digest=excluded.digest,issued_at=excluded.issued_at,expires_at=excluded.expires_at,attempts=0,verified_until=NULL,window_started=excluded.window_started,issues_in_window=excluded.issues_in_window;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.rv_platform_email_issue(uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rv_platform_email_issue(uuid,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.rv_platform_email_verify(p_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c rv_platform_private.email_challenges%ROWTYPE;
BEGIN
 IF NOT public.rv_platform_email_context() OR p_code IS NULL OR p_code !~ '^[0-9]{6}$' THEN RETURN false; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,85));
 SELECT * INTO c FROM rv_platform_private.email_challenges WHERE user_id=auth.uid() AND session_id::text=auth.jwt()->>'session_id' FOR UPDATE;
 IF NOT FOUND OR c.expires_at<=now() OR c.attempts>=5 OR c.verified_until IS NOT NULL THEN RETURN false; END IF;
 IF c.digest IS DISTINCT FROM pg_catalog.sha256(pg_catalog.convert_to(c.salt::text||':'||p_code,'UTF8')) THEN
 UPDATE rv_platform_private.email_challenges SET attempts=attempts+1 WHERE user_id=auth.uid(); RETURN false; END IF;
 UPDATE rv_platform_private.email_challenges SET verified_until=now()+interval '1 hour',digest=pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.gen_random_uuid()::text,'UTF8')) WHERE user_id=auth.uid();
 INSERT INTO rv_platform_private.audit(actor_id,action) VALUES(auth.uid(),'Verified platform email code');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.rv_platform_email_verify(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rv_platform_email_verify(text) TO authenticated;
CREATE OR REPLACE FUNCTION public.rv_platform_email_verified() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.rv_platform_email_context() AND EXISTS(SELECT 1 FROM rv_platform_private.email_challenges c WHERE c.user_id=auth.uid() AND c.session_id::text=auth.jwt()->>'session_id' AND c.verified_until>now());
$$;
REVOKE ALL ON FUNCTION public.rv_platform_email_verified() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rv_platform_email_verified() TO authenticated;
CREATE OR REPLACE FUNCTION public.rv_platform_admin_overview(p_offset integer DEFAULT 0, p_search text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; q text:=left(btrim(coalesce(p_search,'')),200); skip_rows integer:=greatest(0,least(coalesce(p_offset,0),1000000));
BEGIN
 IF NOT public.rv_platform_email_verified() THEN
   RAISE EXCEPTION 'Platform owner and email verification required' USING ERRCODE='42501';
 END IF;
 INSERT INTO rv_platform_private.audit(actor_id,action) VALUES(auth.uid(),'Viewed platform overview');
 SELECT jsonb_build_object(
   'generated_at',now(),
   'stats',jsonb_build_object(
    'accounts',(SELECT count(*) FROM auth.users),
    'brokerages',(SELECT count(*) FROM public.brokerages),
    'brokerage_admins',(SELECT count(*) FROM public.brokerage_members WHERE role='admin'),
    'agents',(SELECT count(*) FROM public.brokerage_members WHERE role='agent'),
    'pending_invitations',(SELECT count(*) FROM public.office_agents WHERE status='Invited'),
    'signed_in_24h',(SELECT count(*) FROM auth.users WHERE last_sign_in_at>=now()-interval '24 hours'),
    'crm_records',(SELECT count(*) FROM public.crm_contacts),
    'transaction_records',(SELECT count(*) FROM public.deal_files),
    'stored_files',(SELECT count(*) FROM storage.objects)
   ),
   'matching_accounts',(SELECT count(*) FROM auth.users u WHERE q='' OR strpos(lower(coalesce(u.email,'')),lower(q))>0 OR EXISTS(SELECT 1 FROM public.brokerage_members m JOIN public.brokerages b ON b.id=m.brokerage_id WHERE m.user_id=u.id AND strpos(lower(b.name),lower(q))>0)),
   'accounts',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (
      SELECT u.id,u.email, left(coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),a.full_name,''),150) AS account_name,
        b.name AS brokerage,m.role AS brokerage_role,u.created_at,u.last_sign_in_at,
        u.email_confirmed_at IS NOT NULL AS verified, coalesce(u.banned_until>now(),false) AS banned,
        EXISTS(SELECT 1 FROM rv_platform_private.admins pa WHERE pa.user_id=u.id) AS platform_owner
      FROM auth.users u LEFT JOIN public.brokerage_members m ON m.user_id=u.id
      LEFT JOIN public.brokerages b ON b.id=m.brokerage_id
      LEFT JOIN LATERAL (SELECT oa.full_name FROM public.office_agents oa WHERE oa.user_id=u.id AND oa.brokerage_id=m.brokerage_id ORDER BY oa.id LIMIT 1) a ON true
      WHERE q='' OR strpos(lower(coalesce(u.email,'')),lower(q))>0 OR strpos(lower(coalesce(b.name,'')),lower(q))>0
      ORDER BY u.created_at DESC,u.id LIMIT 50 OFFSET skip_rows
   ) x),'[]'::jsonb),
   'recent_admin_activity',coalesce((SELECT jsonb_agg(to_jsonb(y) ORDER BY y.occurred_at DESC,y.id DESC) FROM (SELECT id,action,occurred_at FROM rv_platform_private.audit ORDER BY occurred_at DESC,id DESC LIMIT 10) y),'[]'::jsonb)
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rv_platform_admin_overview(integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rv_platform_admin_overview(integer,text) TO authenticated;
COMMIT;
