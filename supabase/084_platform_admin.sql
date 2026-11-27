-- Run as project owner in SQL Editor, on staging first. No account/data deletion.
BEGIN;
CREATE SCHEMA IF NOT EXISTS rv_platform_private;
REVOKE ALL ON SCHEMA rv_platform_private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS rv_platform_private.admins (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rv_platform_private.audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL, action text NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rv_platform_private.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE rv_platform_private.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA rv_platform_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA rv_platform_private FROM PUBLIC, anon, authenticated;
-- Bind the privilege to the existing, verified account ID, not editable profile metadata.
DO $$
DECLARE uid uuid; matches bigint;
BEGIN
 SELECT count(*) INTO matches FROM auth.users WHERE lower(email)='inderbains@gmail.com' AND email_confirmed_at IS NOT NULL;
 IF matches<>1 THEN RAISE EXCEPTION 'Expected exactly one verified owner account. No changes applied.'; END IF;
 SELECT id INTO uid FROM auth.users WHERE lower(email)='inderbains@gmail.com' AND email_confirmed_at IS NOT NULL;
 IF EXISTS (SELECT 1 FROM rv_platform_private.admins WHERE user_id<>uid) THEN
   RAISE EXCEPTION 'Another platform admin is already configured; review manually.';
 END IF;
 INSERT INTO rv_platform_private.admins(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
END $$;
CREATE OR REPLACE FUNCTION public.rv_platform_admin_allowed() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM rv_platform_private.admins a JOIN auth.users u ON u.id=a.user_id WHERE a.user_id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND lower(u.email)='inderbains@gmail.com');
$$;
REVOKE ALL ON FUNCTION public.rv_platform_admin_allowed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rv_platform_admin_allowed() TO authenticated;
CREATE OR REPLACE FUNCTION public.rv_platform_admin_overview(p_offset integer DEFAULT 0, p_search text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; q text:=left(btrim(coalesce(p_search,'')),200); skip_rows integer:=greatest(0,least(coalesce(p_offset,0),1000000));
BEGIN
 IF NOT public.rv_platform_admin_allowed() OR coalesce(auth.jwt()->>'aal','') <> 'aal2' THEN
   RAISE EXCEPTION 'Platform owner and MFA required' USING ERRCODE='42501';
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
-- Read-only confirmation in SQL Editor: does not expose credentials.
SELECT u.email, a.granted_at FROM rv_platform_private.admins a JOIN auth.users u ON u.id=a.user_id;
