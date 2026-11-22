# RealVolt Fix 045 — Agent & Brokerage Home Dashboards

## Scope
- Updates the **My workspace home dashboard** for agents and brokerage administrators.
- **Does not change the separate Back Office dashboard** (`app/back-office.tsx`, `app/back-office-dashboard.tsx`).
- Agent home: their editable quote and their own monthly firm-sale goal.
- Brokerage admin home: editable brokerage-wide quote and brokerage-wide monthly firm-sale goal. Both preferences are shared between admins in the same brokerage. Only a verified admin may edit them.
- Changes **+ Add date** to **+ Add reminder**.
- Right-side tabs: Reminders, Upcoming, Activity, Clients, Completed. Reminders within 7 days; Upcoming transaction dates and personal reminders more than 7 days away; Completed personal reminders.
- User's quote is displayed directly without a "My motivation" heading. Click to edit, Save or Cancel.
- Dashboard remains compact in the original sage-green theme; the right-side panels are collapsed until selected.
- Sales use firm-sale date (subject removal): agent home counts own qualifying firm sales; brokerage home uses `rv_brokerage_sales_leaderboard` (SQL 034) to count office-wide qualifying firm sales. A later legal completion does not count again.

## Before installation
1. Back up the current GitHub repository and Supabase database.
2. Ensure SQL 034 and 035 have been installed and firm-sale leaderboard works.
3. Run `supabase/045_agent_and_brokerage_home.sql` in a **staging** Supabase database first. Then deploy to production if successful.
4. In GitHub replace ONLY the four paths, with current-version comparison before replacing:
   - `app/personal-dates.tsx`
   - `app/SmartInbox037.tsx`
   - `app/SmartInbox037.module.css`
   - `app/workspace-home.tsx`
5. Do not upload this ZIP into GitHub itself and do not replace the entire application.
6. Test `npm run build` with Node.js 22 before merging `main`. The code was checked against **crmsocial-main (4).zip** supplied in this conversation; current GitHub may have newer edits.

## Manual testing checklist
- Log in as an agent. Click displayed quote, edit, Save. Refresh: quote persists. Try another account: not visible.
- Agent goal: set to 5, verify monthly firm sales count matches own verified deals, refresh and next month rollover.
- Agent: Add reminder, open Reminders and Upcoming, mark completed, confirm Completed tab.
- Log in as a brokerage administrator. Under **My workspace** (NOT Back Office) change quote and goal. Refresh: persists. A second admin of the same brokerage sees the same values.
- Office-wide sales count matches the leaderboard's current-month firm sales total. Admins cannot read or edit another brokerage's preferences.
- Back Office dashboard and original icon cards are unchanged.
- Test narrow-screen rendering and notification item links.

## Notes
- No automatic email, trust movement, commission payout, or Back Office action was changed.
- Monthly figures are based on Vancouver local date; qualifying sales must be `Sold`, `Completed`, or `Archived` and have a recorded firm date and positive price.
- If the account has no valid brokerage membership, office goal data is unavailable and no other brokerage's data should be displayed.
- If SQL 045 is missing, quote/goal settings will show an installation error; existing personal reminders still work.
