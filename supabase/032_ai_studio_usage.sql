-- RealVolt 032: owner-private AI activity log for user-scoped hourly usage checks.
-- Safe additive migration; requires 003 CRM. No messaging or API keys in database.
BEGIN;
CREATE TABLE IF NOT EXISTS public.rv_ai_generations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 mode text NOT NULL CHECK(mode IN ('cma','listing','marketing','lead')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rv_ai_generations_owner_time ON public.rv_ai_generations(user_id,created_at DESC);
ALTER TABLE public.rv_ai_generations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rv_ai_generations_owner_read ON public.rv_ai_generations;
CREATE POLICY rv_ai_generations_owner_read ON public.rv_ai_generations FOR SELECT TO authenticated
 USING (user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS rv_ai_generations_owner_insert ON public.rv_ai_generations;
CREATE POLICY rv_ai_generations_owner_insert ON public.rv_ai_generations FOR INSERT TO authenticated
 WITH CHECK (user_id=(SELECT auth.uid()));
REVOKE ALL ON public.rv_ai_generations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.rv_ai_generations TO authenticated;
GRANT ALL ON public.rv_ai_generations TO service_role;
COMMIT;
