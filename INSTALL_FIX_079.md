# RealVolt Fix 079 — Keep existing tabs; route notifications to their categories

**Base:** Fix 077, plus the separate Fix 078 ZIP utility repair. This patch does not modify any of the ZIP-download or transaction accounting code.

## Install 4 files inside GitHub `app/`

Replace only:

- `app/personal-dates.tsx`
- `app/back-office-dashboard.tsx`
- `app/SmartInbox037.tsx`
- `app/SmartInbox037.module.css`

Keep the latest `closed-file-download.ts` from Fix 078 and all other code as-is. Do **not** upload the ZIP itself to the repository. Commit these four files and let Hostinger rebuild.

## Result

- Remove the separate Notifications tab from the Agent and Brokerage workspace dashboards **and** the Back Office dashboard.
- Route unread transaction events into the existing category: Sold, Accepted Offer, Completed or Activity. New listing submissions, listing document updates and correction requests appear under Activity. Sale approvals while the transaction is at Sold stage appear under Sold. Closed/archived sales remain under Completed.
- Back Office dashboard (its own tabs: Review, Upcoming, Deal stages): pending new/updated submissions appear under Review; other deal updates under Deal stages.
- An orange dot identifies tabs with unread events. Opening the workspace initially chooses the category containing the most recent accessible unread event, but does not change tabs while someone is already navigating.
- Recent unread event sits above the saved transaction record. One event row per file/category prevents floods of separate document uploads. Clicking it opens the exact transaction with appropriate corrections/compliance controls, then marks that file's unread notifications as viewed; the permanent transaction remains in its category and original file/folder.
- Existing read/unread table and private Supabase permissions are preserved. No new SQL, storage changes, migrations, or npm dependencies.

## Verify in live RealVolt

1. On Brokerage Workspace, confirm **no Notifications tab**, and see Reminders / Upcoming / Activity / Clients / Completed / Accepted Offer / Sold.
2. Have an agent submit or update a listing. An orange dot should appear on Activity. Open it and confirm Back Office review/correction actions open on the **same original transaction**.
3. Submit/approve a firm sale with stage Sold. Look under **Sold** (not a Notifications tab). Open the unread entry and confirm it becomes the ordinary saved sale item after viewing.
4. Archive that sale. Confirm it remains under **Completed** and Back Office > Closed Files, with its original documents still accessible.
5. Check the separate Back Office dashboard: pending submissions in Review; updates to non-pending deals in Deal stages.
6. Verify the Fix 078 closed-file ZIP download continues to function.

**Validation:** Source TypeScript syntax checks and targeted source assertions passed. This is not a verified full Hostinger build or authenticated production test; run the deployment and test the navigation with real agent and brokerage admin accounts.
