-- Requires 084–086. Staging first. No Stripe, no charges, no customer data deletion.
BEGIN;
CREATE TABLE IF NOT EXISTS rv_platform_private.plans (
 code text PRIMARY KEY CHECK(code ~ '^[a-z0-9_-]{1,40}$'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
 kind text NOT NULL CHECK(kind IN ('independent','brokerage')),
 monthly_cents integer NOT NULL CHECK(monthly_cents BETWEEN 0 AND 10000000),
 modules text[] NOT NULL DEFAULT '{}', enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rv_platform_private.plan_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
 brokerage_id uuid UNIQUE REFERENCES public.brokerages(id) ON DELETE CASCADE,
 plan_code text NOT NULL REFERENCES rv_platform_private.plans(code),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((user_id IS NOT NULL)::integer + (brokerage_id IS NOT NULL)::integer = 1)
);
CREATE TABLE IF NOT EXISTS rv_platform_private.account_reviews (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 requested_by uuid NOT NULL, reason text NOT NULL, requested_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE rv_platform_private.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE rv_platform_private.plan_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rv_platform_private.account_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON rv_platform_private.plans,rv_platform_private.plan_assignments,rv_platform_private.account_reviews FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO rv_platform_private.plans(code,name,kind,monthly_cents,modules) VALUES
 ('agent','Independent Realtor','independent',4999,ARRAY['crm','social','open_houses','email']),
 ('brokerage','Brokerage per agent','brokerage',6999,ARRAY['crm','social','open_houses','email','transactions','back_office','accounting','reports'])
ON CONFLICT(code) DO NOTHING;
CREATE OR REPLACE FUNCTION public.rv_platform_plan_catalog() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.rv_platform_email_verified() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Verified platform owner required' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.kind,p.code) FROM rv_platform_private.plans p),'[]'::jsonb);
END $$;
CREATE OR REPLACE FUNCTION public.rv_platform_save_plan(p_code text,p_name text,p_kind text,p_monthly_cents integer,p_modules text[],p_enabled boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF public.rv_platform_email_verified() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Verified platform owner required' USING ERRCODE='42501'; END IF;
 IF p_modules IS NULL OR NOT (p_modules <@ ARRAY['crm','social','open_houses','email','transactions','back_office','accounting','reports','signvolt','website','ddf']::text[]) OR (p_kind='independent' AND p_modules && ARRAY['back_office','accounting','reports']::text[]) THEN RAISE EXCEPTION 'Invalid plan modules'; END IF;
 INSERT INTO rv_platform_private.plans(code,name,kind,monthly_cents,modules,enabled) VALUES(p_code,btrim(p_name),p_kind,p_monthly_cents,p_modules,p_enabled)
 ON CONFLICT(code) DO UPDATE SET name=excluded.name,monthly_cents=excluded.monthly_cents,modules=excluded.modules,enabled=excluded.enabled,updated_at=now() WHERE rv_platform_private.plans.kind=excluded.kind;
 IF NOT FOUND THEN RAISE EXCEPTION 'Existing plan type cannot be changed'; END IF;
 INSERT INTO rv_platform_private.audit(actor_id,action) VALUES(auth.uid(),'Saved plan configuration: '||p_code); RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.rv_platform_management_context(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b uuid; n bigint; result jsonb;
BEGIN
 IF public.rv_platform_email_verified() IS DISTINCT FROM true THEN RAISE EXCEPTION 'Verified platform owner required' USING ERRCODE='42501'; END IF;
 SELECT count(*), min(m.brokerage_id::text)::uuid INTO n,b FROM public.brokerage_members m WHERE m.user_id=p_user;
 IF n>1 THEN RAISE EXCEPTION 'Multiple memberships require review'; END IF;
 SELECT jsonb_build_object('id',u.id,'email',u.email,'owner',EXISTS(SELECT 1 FROM rv_platform_private.admins a WHERE a.user_id=u.id),'banned',coalesce(u.banned_until>now(),false),'brokerage_id',b,'brokerage_name',(SELECT name FROM public.brokerages WHERE id=b),'member_count',(SELECT count(*) FROM public.brokerage_members WHERE brokerage_id=b),'plan_code',(SELECT plan_code FROM rv_platform_private.plan_assignments WHERE (b IS NOT NULL AND brokerage_id=b) OR (b IS NULL AND user_id=p_user)), 'deletion_requested',EXISTS(SELECT 1 FROM rv_platform_private.account_reviews WHERE user_id=p_user)) INTO result FROM auth.users u WHERE u.id=p_user;
 IF result IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.rv_platform_assign_plan(p_user uuid,p_plan text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb; b uuid; k text;
BEGIN
 c:=public.rv_platform_management_context(p_user);
 IF (c->>'owner')::boolean THEN RAISE EXCEPTION 'Platform owner is protected'; END IF;
 b:=(c->>'brokerage_id')::uuid;
 SELECT kind INTO k FROM rv_platform_private.plans WHERE code=p_plan AND enabled;
 IF k IS NULL OR k<>(CASE WHEN b IS NULL THEN 'independent' ELSE 'brokerage' END) THEN RAISE EXCEPTION 'Plan does not match account type'; END IF;
 IF b IS NULL THEN
  INSERT INTO rv_platform_private.plan_assignments(user_id,plan_code) VALUES(p_user,p_plan) ON CONFLICT(user_id) DO UPDATE SET plan_code=excluded.plan_code,updated_at=now();
 ELSE
  INSERT INTO rv_platform_private.plan_assignments(brokerage_id,plan_code) VALUES(b,p_plan) ON CONFLICT(brokerage_id) DO UPDATE SET plan_code=excluded.plan_code,updated_at=now();
 END IF;
 INSERT INTO rv_platform_private.audit(actor_id,action) VALUES(auth.uid(),'Assigned plan configuration: '||p_plan||' / '||coalesce(b,p_user)::text); RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.rv_platform_delete_review(p_user uuid,p_reason text,p_cancel boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb;
BEGIN
 c:=public.rv_platform_management_context(p_user);
 IF (c->>'owner')::boolean THEN RAISE EXCEPTION 'Platform owner is protected'; END IF;
 IF p_cancel THEN DELETE FROM rv_platform_private.account_reviews WHERE user_id=p_user;
 ELSE
  IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Enter a reason (5–500 characters)'; END IF;
  INSERT INTO rv_platform_private.account_reviews(user_id,requested_by,reason) VALUES(p_user,auth.uid(),btrim(p_reason)) ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason,requested_by=excluded.requested_by,requested_at=now();
 END IF;
 INSERT INTO rv_platform_private.audit(actor_id,action) VALUES(auth.uid(),CASE WHEN p_cancel THEN 'Cancelled deletion review: ' ELSE 'Requested deletion review: ' END||p_user::text); RETURN true;
END $$;
-- Audit the request before Auth admin API is called. Never authorize the platform owner as target.
CREATE OR REPLACE FUNCTION public.rv_platform_signin_control_audit(p_user uuid,p_action text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c jsonb;
BEGIN
 c:=public.rv_platform_management_context(p_user);
 IF (c->>'owner')::boolean OR p_action NOT IN ('disable requested','enable requested','disable accepted','enable accepted','disable failed','enable failed') THEN RAISE EXCEPTION 'Action not allowed'; END IF;
 INSERT INTO rv_platform_private.audit(actor_id,action) VALUES(auth.uid(),'Sign-in control '||p_action||': '||p_user::text); RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.rv_platform_plan_catalog(),public.rv_platform_save_plan(text,text,text,integer,text[],boolean),public.rv_platform_management_context(uuid),public.rv_platform_assign_plan(uuid,text),public.rv_platform_delete_review(uuid,text,boolean),public.rv_platform_signin_control_audit(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rv_platform_plan_catalog(),public.rv_platform_save_plan(text,text,text,integer,text[],boolean),public.rv_platform_management_context(uuid),public.rv_platform_assign_plan(uuid,text),public.rv_platform_delete_review(uuid,text,boolean),public.rv_platform_signin_control_audit(uuid,text) TO authenticated;
COMMIT;
