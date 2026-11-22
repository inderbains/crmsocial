-- RealVolt Fix 045: agent and brokerage home dashboard preferences.
-- Does not modify the separate Back Office dashboard or transaction financial controls.
BEGIN;

CREATE TABLE IF NOT EXISTS public.rv_agent_dashboard_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  motivation_quote text NOT NULL DEFAULT '' CHECK (length(motivation_quote)<=240),
  monthly_sales_goal integer NOT NULL DEFAULT 5 CHECK (monthly_sales_goal BETWEEN 1 AND 10000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rv_agent_dashboard_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rv_agent_dashboard_private ON public.rv_agent_dashboard_preferences;
CREATE POLICY rv_agent_dashboard_private ON public.rv_agent_dashboard_preferences
  FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
REVOKE ALL ON public.rv_agent_dashboard_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rv_agent_dashboard_preferences TO authenticated;

CREATE TABLE IF NOT EXISTS public.rv_brokerage_dashboard_preferences (
  brokerage_id uuid PRIMARY KEY REFERENCES public.brokerages(id) ON DELETE CASCADE,
  motivation_quote text NOT NULL DEFAULT '' CHECK (length(motivation_quote)<=240),
  monthly_sales_goal integer NOT NULL DEFAULT 5 CHECK (monthly_sales_goal BETWEEN 1 AND 10000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rv_brokerage_dashboard_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rv_brokerage_dashboard_admin ON public.rv_brokerage_dashboard_preferences;
CREATE POLICY rv_brokerage_dashboard_admin ON public.rv_brokerage_dashboard_preferences
  FOR ALL TO authenticated
  USING (brokerage_id=public.current_brokerage() AND public.is_brokerage_admin(brokerage_id))
  WITH CHECK (brokerage_id=public.current_brokerage() AND public.is_brokerage_admin(brokerage_id));
REVOKE ALL ON public.rv_brokerage_dashboard_preferences FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rv_brokerage_dashboard_preferences TO authenticated;

COMMIT;
