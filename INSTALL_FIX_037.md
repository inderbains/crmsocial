# RealVolt Fix 037 — Small interactive workspace notification inbox

Prepared from the supplied RealVolt archive and the Fix 036 patch. This package **has not been compared with the live GitHub branch**. Do not overwrite your entire live repository with an older archive.

## What it changes

**Agent workspace:** Restores the small pale-sage personal-date card; left side keeps Upcoming / Completed and + Add date. Right side contains Reminders, Upcoming, Activity and Clients. Counts come from the user's personal dates, CRM tasks, transaction dates, transaction notices, CRM contacts and CRM notes. Nothing is expanded by default. Clicking a tab displays at most three items initially, with View more in a scrollable space that doesn't stretch the card. Clicking a transaction opens that transaction. Clicking a CRM client opens that actual CRM contact.

**Back Office:** Replaces the busy overview with one compact Office Updates card. Tabs: New files, Review, Upcoming and Activity. Newly submitted files (last 48 hours) and older unresolved reviews are separated. Click a file to open the matching transaction in Back Office. Activity notices are marked read when clicked. Accounting/Reporting/Compliance shortcuts are preserved below; this UI doesn't move money or change commission rules.

**Refreshing:** Polls every 15 seconds and on browser-focus; also listens to Supabase realtime *where the tables are configured for realtime publication*. This is not a promise of instantaneous updates when realtime is disabled. The 15-second fallback is automatic.

## Supabase

**No new SQL migration, table or secret is required.** Existing 003 (CRM), 008 (Personal dates), 034 (transaction summaries/notifications) and 035 need to be present. Existing RLS governs who can read each record. Do NOT re-run older migrations for this layout.

## Safe installation (recommended)

1. Download a **fresh copy of your GitHub repository**, not the November archive from which the earlier patches were prepared.
2. Extract `RealVolt_Fix_037_Compact_Smart_Inbox.zip` into a separate folder (NOT inside the GitHub repository).
3. In a terminal (Node 22 supported), run:

   ```bash
   node /path/to/extracted-fix037/scripts/apply-fix037.mjs /path/to/your/crmsocial
   ```

4. The script preflights the two routing integration points before writing any files. It merges small changes into `app/realvolt-workspace.tsx` and `app/crm.tsx`, and replaces the two presentation components. Backups are saved **outside** your project under the system temporary directory; they are not deployed.
5. From the actual project folder run:

   ```bash
   npm install
   npm run build
   ```

6. Confirm the Git diff contains only the expected Fix037 files and routing integration. Commit/push to `main`; Hostinger will deploy if auto-deploy is enabled.
7. Hard refresh the browser (`Ctrl+F5`) and test with separate agent and brokerage administrator accounts.

If the script says the workspace or CRM source differs from the expected anchors, **it stops before changing files**. Do not force it. Use the current source to merge those small integration edits manually (see `reference-only/`), or upload your latest repo ZIP to ChatGPT to produce exact matching file replacements.

### Changes made to existing files

- `app/personal-dates.tsx`: compact personal date card + live agent inbox
- `app/back-office-dashboard.tsx`: compact Back Office dashboard + office inbox
- `app/realvolt-workspace.tsx`: tiny event handler for deep-linking to the proper CRM contact
- `app/crm.tsx`: optional `openContactId` prop selects the target contact when its data loads

### New files

- `app/SmartInbox037.tsx`
- `app/SmartInbox037.module.css`

### Dependencies copied only if missing

- `app/Office036.module.css`
- `lib/office-insights.mjs`
- `lib/office-insights.d.mts`

Other files (including transactions, CIR, SignVolt, banking, SQL, Stripe and e-signatures) are **not modified**.

## Test cases

1. Agent dashboard size remains approximately the original small sage-green card; no expanded transaction feed on page load.
2. Click Reminders: due personal dates / outstanding CRM follow-ups appear, with a number badge only if due in the next 7 days or overdue.
3. Click Upcoming: subject-removal, completion and listing-expiry dates appear, linked to the transaction.
4. Click Activity: unread notices count is displayed; opening one marks it read and opens the correct deal.
5. Click Clients: CRM contacts/notes from recent activity appear, and opening one takes you to that contact profile.
6. Back Office dashboard: new submitted files show up in New files; click opens the specific review file. Outstanding older reviews appear under Review.
7. Test a different brokerage account; neither inbox may expose another brokerage's records.
8. Test mobile viewport and keyboard: selecting the current tab again closes it; View more scrolls without stretching the card.
9. Confirm accounting, financial reporting, commission and trust pages continue unchanged.

## Validation performed

- Five focused source behavior checks passed.
- TypeScript/TSX transpilation and syntax checks passed for all new and merged files.
- Safe merge script applied successfully to a recovered reference project.

**Not tested:** Full Next.js production build against your *current* GitHub commit, or authenticated live Supabase integration. Both must be tested before your production rollout.
