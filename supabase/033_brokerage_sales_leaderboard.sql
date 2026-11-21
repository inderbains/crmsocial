-- RealVolt 033: brokerage-scoped agent sales leaderboard.
-- Requires: 004_transactions.sql, 005_lawyers_closing.sql, 009_agent_management.sql,
--           008_personal_workspace.sql and 031_deal_milestones_followups.sql.
-- Additive: no existing data is modified. Does NOT read or expose commissions.
-- Period = calendar month or calendar year in America/Vancouver.
-- Only an agent-confirmed 'Completion confirmed' milestone qualifies a deal.
BEGIN;

CREATE OR REPLACE FUNCTION public.rv_brokerage_sales_leaderboard(
  p_period text DEFAULT 'month', p_sort text DEFAULT 'volume'
)
RETURNS TABLE (
  rank integer,
  agent_id uuid,
  agent_name text,
  sales_count bigint,
  sales_volume numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_brokerage uuid;
  v_today date := (now() AT TIME ZONE 'America/Vancouver')::date;
  v_period_start date;
  v_period_end date;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required' USING ERRCODE = '42501';
  END IF;
  IF p_period IS NULL OR p_period NOT IN ('month','year') THEN
    RAISE EXCEPTION 'Invalid leaderboard period' USING ERRCODE = '22023';
  END IF;
  IF p_sort IS NULL OR p_sort NOT IN ('volume','sales') THEN
    RAISE EXCEPTION 'Invalid leaderboard sort' USING ERRCODE = '22023';
  END IF;

  -- Never accept brokerage_id from the client: derive tenant from signed-in user.
  SELECT m.brokerage_id INTO v_brokerage
  FROM public.brokerage_members m
  WHERE m.user_id = auth.uid();
  IF v_brokerage IS NULL THEN
    RAISE EXCEPTION 'No brokerage membership for this account' USING ERRCODE = '42501';
  END IF;

  v_period_start := date_trunc(p_period, v_today::timestamp)::date;
  v_period_end := CASE WHEN p_period = 'month'
    THEN (v_period_start + interval '1 month')::date
    ELSE (v_period_start + interval '1 year')::date END;

  RETURN QUERY
  WITH office_agents AS (
    SELECT m.user_id AS member_id,
      COALESCE(NULLIF(btrim(oa.full_name),''),
               NULLIF(btrim(ap.full_name),''), 'Agent') AS display_name
    FROM public.brokerage_members m
    LEFT JOIN public.office_agents oa
      ON oa.user_id = m.user_id AND oa.brokerage_id = m.brokerage_id
    LEFT JOIN public.agent_workspace_profiles ap ON ap.user_id = m.user_id
    WHERE m.brokerage_id = v_brokerage
      AND (m.role = 'agent' OR (oa.user_id IS NOT NULL AND oa.status = 'Active'))
  ),
  completed_sales AS (
    SELECT d.id, d.user_id, d.sale_price
    FROM public.deal_files d
    WHERE d.brokerage_id = v_brokerage
      AND d.kind = 'Sale'
      AND d.sale_price IS NOT NULL AND d.sale_price > 0
      AND d.completion_date >= v_period_start
      AND d.completion_date < v_period_end
      AND d.completion_date <= v_today
      -- Prevent counting drafts, accepted offers and unverified date entries.
      AND EXISTS (
        SELECT 1 FROM public.rvcrm_deal_milestones ms
        WHERE ms.deal_id = d.id
          AND ms.user_id = d.user_id
          AND ms.event_type = 'Completion confirmed'
      )
  ),
  totals AS (
    SELECT oa.member_id, oa.display_name,
           count(cs.id)::bigint AS num_sales,
           coalesce(sum(cs.sale_price),0)::numeric AS volume_cad
    FROM office_agents oa
    LEFT JOIN completed_sales cs ON cs.user_id = oa.member_id
    GROUP BY oa.member_id, oa.display_name
  ),
  ranked AS (
    SELECT row_number() OVER (
      ORDER BY
        CASE WHEN p_sort='sales' THEN t.num_sales END DESC NULLS LAST,
        CASE WHEN p_sort='volume' THEN t.volume_cad END DESC NULLS LAST,
        t.volume_cad DESC, t.num_sales DESC,
        lower(t.display_name), t.member_id
    )::integer AS position,
    t.member_id, t.display_name, t.num_sales, t.volume_cad
    FROM totals t
  )
  SELECT r.position, r.member_id, r.display_name, r.num_sales, r.volume_cad
  FROM ranked r
  ORDER BY r.position;
END;
$$;

-- Security-definer endpoint: authenticated brokerage members only.
REVOKE ALL ON FUNCTION public.rv_brokerage_sales_leaderboard(text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rv_brokerage_sales_leaderboard(text,text)
  TO authenticated;
COMMIT;
