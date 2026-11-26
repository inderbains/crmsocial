# RealVolt Fix 069 — Dashboard transaction tabs + correction resubmission

**Base:** Version 9 / current Fix 068 transaction workflow. This is an incremental update, **not** a replacement for the Version 6-style transaction design. Existing migrations through Fix 068 must already be installed. Do **not** upload this ZIP itself to GitHub.

## Changes

1. Personal workspace: adds **Accepted Offer** and **Sold** tabs immediately after **Completed**. These display existing sale transactions from the database, not extra copies of the files. Sold includes sale files at Sold, Completed, and Archived, and distinguishes their stage in the row description.
2. The **Activity** tab now lists **only** Offer Collapsed, Subject Extension, and Listing Terminated actions. Agent actions are read from `transaction_audit_events` (an agent generally does not receive their own outbound Back Office notifications). The brokerage dashboard reads the corresponding audit events for accessible brokerage transactions, including actions taken by its Realtors. The other tabs remain unchanged.
3. On **Changes requested** files (listing **or** sale), the agent sees a clear **Resubmit changes to Back Office** button beside the review feedback. It keeps the same transaction ID and sends `review_status` from `Changes requested` to `Submitted`. The existing database trigger generates a new Back Office notification. No approval is automatic.
4. The original listing **Submit to back office** action is now for fresh Draft listings only, avoiding duplicate buttons during corrections.
5. The Back Office transaction list quietly refreshes every 15 seconds and on window focus, so resubmitted files return to the **Submitted** queue without a hard page reload. You can still press Refresh for an immediate update. Existing reviewer permissions remain unchanged.

## GitHub — only three changed files

Go to the repository **app/** folder. Upload and replace these files from this package's `app/` folder:

- `app/transactions.tsx`
- `app/personal-dates.tsx`
- `app/SmartInbox037.tsx`

Commit. Do **not** upload files to the GitHub root. Hostinger should rebuild normally.

## Supabase

**No new SQL is included or required for this change** if your existing `deal_files`, `rv_transaction_notifications` trigger, and `transaction_audit_events` migrations are installed. The status change uses the existing guarded update, so users cannot approve their own file. The admin notification is produced by the existing `rv_tx_notify_trigger` on `Changes requested` -> `Submitted`.

## Test on staging before deploying for real transactions

1. Agent: open a listing or sold file marked **Changes requested**. Replace or upload the document the manager requested. Click **Resubmit changes to Back Office**. Confirm status changes to **Submitted**, without creating a new transaction.
2. Back Office: the resubmitted file must disappear from **Changes requested**, appear in the **Review queue**, and generate a new notification. Open the same file, verify the updated document, and approve or request further changes. If a file remains missing, do **not** approve it.
3. Personal workspace: verify **Accepted Offer** and **Sold** tabs alongside **Completed**. Click one to open its existing transaction. Check **Activity** displays only an actual offer collapse, subject extension, or listing termination (no routine approvals, commission updates, or general notifications). Check the reminder popup still works.
4. Confirm the previously working accepted-offer and firm-sale submission flows, status-border colours, CIR and read-only Back Office document review are unchanged.

## Verification limits

The three changed components pass source/TSX syntax checks. In the available partial test environment, the number of pre-existing test failures does not increase compared with Fix 068. A full Next.js production build and actual Supabase staging end-to-end test have not been performed. Do not assume bank/payment workflows are tested by this patch.
