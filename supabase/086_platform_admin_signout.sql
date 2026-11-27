-- Requires Fix 085. Invalidate only the calling platform admin session's email challenge.
BEGIN;
CREATE OR REPLACE FUNCTION public.rv_platform_email_sign_out() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.rv_platform_email_context() THEN RETURN false; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,85));
 -- Retain issuance rate limits; invalidate the outstanding code and verified window.
 UPDATE rv_platform_private.email_challenges
 SET expires_at=now(), verified_until=NULL, attempts=5,
     digest=pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.gen_random_uuid()::text,'UTF8'))
 WHERE user_id=auth.uid() AND session_id::text=auth.jwt()->>'session_id';
 INSERT INTO rv_platform_private.audit(actor_id,action) VALUES(auth.uid(),'Signed out of platform administration');
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.rv_platform_email_sign_out() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rv_platform_email_sign_out() TO authenticated;
COMMIT;
