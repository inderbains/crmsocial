# RealVolt — Top Agents Leaderboard (Monthly / Yearly)

## What this patch adds
A compact **Top Agents** section to the existing **My workspace** (main) dashboard, visible to brokerage members. It shows the highest-performing agents, ranked by either **sales volume (CAD)** or **completed sale count**, with a **Monthly / Yearly** selector and a **View all agents** expansion. It uses the existing RealVolt white/off-white, dark green, accent, and brokerage theme variables; no commission values or individual client information are displayed.

## How the numbers are calculated
- **One sale** = one **Sale** record in `deal_files` with a positive `sale_price`, an actual `completion_date`, and a matching `rvcrm_deal_milestones` event of `Completion confirmed` entered by the transaction's agent.
- **Sales volume** = sum of `deal_files.sale_price` for those completed sales, **not** commissions or commission splits.
- **Monthly** = completions dated within the current calendar month (America/Vancouver); **Yearly** = within the current calendar year.
- The brokerage is derived from the logged-in user's `brokerage_members` entry; agents cannot request other brokerage totals. The function returns only agent names, counts, and sums. No clients, notes, financial payout details, or underlying deal IDs are returned.
- The agent who owns the transaction gets credit for the sale. Shared listings/multi-agent split credit are **not yet supported**.
- A sale without a confirmed completion milestone does **not** appear. This is deliberate, to avoid treating a scheduled completion date or an approved back-office file as a closed sale. Verify older sales and record the completion milestone before expecting them in historical tallies.
- This is a live *refresh-on-load/switch* report, not an automatic real-time stream. Tap Refresh to load the newest records.

## Prerequisites
- Existing `brokerage_members`, `office_agents`, `agent_workspace_profiles`, and `deal_files` tables.
- Migration `031_deal_milestones_followups.sql` already applied and tested; `rvcrm_deal_milestones` must exist.
- Back up your production database and project before installing; test with a staging brokerage first.

## Installation
1. Back up the current main GitHub branch and Supabase database.
2. In Supabase SQL Editor (staging first), run `supabase/033_brokerage_sales_leaderboard.sql` once. It creates a **read-only** authenticated RPC function and does not alter existing data.
3. Upload these new files into matching directories of your current GitHub repo:
   - `app/agent-leaderboard.tsx`
   - `app/agent-leaderboard.module.css`
   - `supabase/033_brokerage_sales_leaderboard.sql` (to keep migration under version control)
4. For `app/workspace-home.tsx`, **merge just two additions into your latest file** rather than overwriting newer edits:
   - After `import PersonalDates from './personal-dates';`, add:
     `import AgentLeaderboard from './agent-leaderboard';`
   - After `<PersonalDates userId={userId} notify={notify}/>`, add:
     `<AgentLeaderboard userId={userId}/>`
   The ZIP includes a ready-to-use `app/workspace-home.tsx` from the latest project snapshot available here and `WORKSPACE_HOME_CHANGES.diff` as a reference. If your live file has newer changes, preserve them.
5. Redeploy with your normal Hostinger build process (`npm run build`), then open **My workspace**. You will see **Top Agents** below the existing personal-dates section.

## Quick verification
On Supabase SQL Editor, check the installed function without exposing private sales:

```sql
SELECT to_regprocedure('public.rv_brokerage_sales_leaderboard(text,text)') IS NOT NULL AS installed;
```

From **your signed-in RealVolt application**, test:
1. Monthly / Yearly toggles, Volume / Sales ordering, and Refresh.
2. An agent-owned Sale deal with a real completion date and a recorded `Completion confirmed` milestone appears exactly once with its sale price.
3. A future completion or an offer without confirmed completion does **not** appear.
4. A member of a different brokerage never sees the first brokerage's agents or totals.
5. Independent agents with no brokerage have no comparative office leaderboard.
6. Changing brokerage theme in Settings adjusts the widget's accents.

## Important limitations
- This patch is **not yet deployed** to your live RealVolt system. The full Hostinger production build and integration against your live Supabase cannot be verified here.
- It works only with correctly recorded completed transactions; existing unconfirmed/historic transactions will not appear automatically.
- Although the function is constrained to the signed-in brokerage, you should confirm that showing aggregate agent sales volume to *all* brokerage members matches your brokerage's internal privacy policy before enabling it for paying customers.
- This patch adds only a small leaderboard section. No unnecessary graph or redesigned navigation is included.
