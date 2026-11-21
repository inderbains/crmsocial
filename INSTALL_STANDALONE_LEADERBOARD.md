# RealVolt — Leaderboard as a separate application

## Result
On **My workspace → Your applications**, a new **Leaderboard** card appears with the same module-card layout as CRM, Transactions, Social Studio and SignVolt. Click **Open application** to see a dedicated **Agent Leaderboard** screen. It does **not** show a leaderboard widget on the My workspace main page.

The page provides:
- **Monthly / Yearly** period selection (America/Vancouver)
- **Volume / Sales** ranking selection
- All agents with confirmed completed sales in the selected period, not just the top five
- Each agent's rank, name, completed sale count, and sum of sale prices in CAD
- Refresh button and back navigation to **My workspace**
- Existing RealVolt theme colours and light, spacious layout. **No commissions, agent commissions, or client identities**.

## Before installing
Back up your main GitHub branch and Supabase database. Test the upgrade on a staging deployment first. This patch was prepared against an available `crmsocial-main` snapshot: **your live GitHub source may have newer changes**, so do not blindly overwrite `app/workspace-home.tsx` or `app/realvolt-workspace.tsx` if they differ.

### Database prerequisite — SQL 033
The module uses the same read-only brokerage-scoped Supabase function from the previous leaderboard patch. **If you already ran SQL 033, do not run it again.** To check, run:

```sql
SELECT to_regprocedure('public.rv_brokerage_sales_leaderboard(text,text)') IS NOT NULL AS installed;
```

If `false`, install `supabase/033_brokerage_sales_leaderboard.sql` once in staging first, after migration `031_deal_milestones_followups.sql`, and then in production after backup.

### Recommended installation (preserves newer workspace changes)

1. In your **latest** local clone of `github.com/inderbains/crmsocial`, copy these new/replaced files from this ZIP:
   - `app/agent-leaderboard.tsx`
   - `app/agent-leaderboard.module.css`
   - `scripts/install-leaderboard-module.mjs`
   - `supabase/033_brokerage_sales_leaderboard.sql` (keep the migration in source control)
2. From your repository root, preview the two targeted routing changes:

```bash
node scripts/install-leaderboard-module.mjs --dry-run
```

3. Apply the two **small** modifications to your **existing** `app/workspace-home.tsx` and `app/realvolt-workspace.tsx`:

```bash
node scripts/install-leaderboard-module.mjs
```

   This safely removes the previous main-page `<AgentLeaderboard/>` widget (if installed), adds the **Leaderboard** card, and connects it to its own workspace page. It fails rather than overwriting a workspace structure it doesn't recognize. You can run it again; the merge is idempotent.
4. Review changes with `git diff`. Then commit/push to GitHub and redeploy in Hostinger using `npm run build`.
5. If you only edit through **GitHub's web interface**, instead compare the included example files `app/workspace-home.tsx`, `app/realvolt-workspace.tsx` and the two `.diff` files with your current repository. Merge just the additions; **do not replace newer versions of these files wholesale**.

## Test in RealVolt
1. Open **My workspace**. There should be a **Leaderboard** app card alongside the other applications, and **no ranking table on the My workspace page**.
2. Click **Open application** → **Agent Leaderboard**.
3. Try **Monthly** → **Yearly**, then **Volume** → **Sales**; verify different ordering if relevant sales are present.
4. Add or verify a *Sale* deal with a positive sale price, valid actual completion date, and an agent-recorded **Completion confirmed** milestone. The Refresh button should update its totals, without duplicate counting.
5. Check a different brokerage account sees only its own brokerage rankings; independent agents should see an explanatory message, not someone else's records.
6. Confirm your Settings theme affects the leaderboard accents.

## Counting rules and important limitations
- Count one completed Sale from `deal_files` only when a matching `rvcrm_deal_milestones` event of `Completion confirmed` exists, with actual `completion_date` within the selected month or year.
- Sales volume = sum of recorded **sale prices**, not commissions or payouts.
- Historical sales without an agent-recorded completion milestone **will not appear** until verified. No invented rankings.
- Sales are credited to the deal's owning agent; a joint transaction credit policy is not implemented.
- It uses the existing signed-in brokerage membership. The SQL shares **agent names and sale-volume totals among members of that brokerage**, so check your internal privacy policy before enabling in a large firm.
- Rankings refresh on page load, selector changes, or Refresh. They are not a realtime websocket feed.
- The install is **not live** until you merge and deploy. Four targeted tests and TypeScript syntax checks passed. **A full production Next.js build and a live Supabase integration test were not performed here.**
