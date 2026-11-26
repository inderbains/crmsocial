# RealVolt Fix 080 — Three simple workspace tabs

**Base:** Fix 079. Keep all other Fix 077–079 files, including Fix 078's `app/closed-file-download.ts` TypeScript repair.

## Installation
1. Extract `RealVolt_Fix_080_Three_Workspace_Tabs.zip`.
2. In GitHub, open `github.com/inderbains/crmsocial`, branch `main`, folder `app/`.
3. Replace **only** `app/personal-dates.tsx` with the copy inside this ZIP.
4. Commit; let Hostinger rebuild. Do **not** upload the ZIP itself into GitHub.
5. No Supabase SQL, new storage provider, npm dependencies, or accounting changes required.

## Main workspace (agent and brokerage administrator)
The right-side tab bar has **only**:
- **Notifications** — new/unread transaction notifications, e.g. uploaded document, new listing submitted, review requested, approved/sold. Click opens the **original transaction** at the proper review/corrections stage; upon successful navigation, that file's notices are marked read and disappear from the dashboard. Multiple unread notifications about one transaction collapse into the latest one so the inbox isn't flooded.
- **Upcoming Dates** — scheduled property/transaction dates (e.g. listing expiry, subject removal, completion and possession). Brokerage administrators see brokerage dates; agents see their own dates.
- **Reminder Dates** — unfinished personal reminders and dated CRM follow-ups, including overdue tasks. The Add Reminder popup remains unchanged. Reminder dates do not appear in Upcoming Dates.

Transaction records remain stored in their regular module: Agents > Transactions > All Transactions / Sales (including archived transactions) and Back Office > Closed Files for archived deals. No new Closed Files folder is added to the agent sidebar.

This patch changes **only the main workspace widget**. Back Office's separate operations dashboard keeps its existing Review/Upcoming/Deal stages tools and cards, and transaction/security/accounting permissions are unchanged.

## Live verification
1. Sign in as agent: on My workspace the only tabs are Notifications, Upcoming Dates, Reminder Dates.
2. Sign in as brokerage admin: on Brokerage workspace the same three tabs appear. Check that Upcoming Dates includes office transactions, not only the admin's own deals.
3. With an agent submit/update a listing. Back Office receives unread notification; click it and confirm it opens that listing in review with Approve/Request Changes available.
4. Request changes; confirm the agent receives an alert that opens the original editable file with Resubmit Changes available.
5. Return to home: the viewed notification no longer appears. The transaction remains accessible in its original list or folder.
6. Archive a completed sale and confirm it remains in Back Office > Closed Files (ZIP download remains available) and agent Transactions > All Transactions / Sales.
7. Confirm reminder creation and CRM follow-up links still work.

**Validation performed:** TypeScript/TSX transpilation diagnostics and targeted source assertions passed; ZIP integrity verified. Full Hostinger build and live Supabase access/RLS tests were not available in this environment.
