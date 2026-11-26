# RealVolt Fix 077 — Back Office Closed Files card, actionable notifications, and ZIP downloads

Base: **Fix 076** (with previous Fix 075 styling and the established Version 6 transaction workflow).

## Install only these 7 files in GitHub `app/`

Replace existing:

- `app/back-office-dashboard.tsx`
- `app/personal-dates.tsx`
- `app/realvolt-workspace.tsx`
- `app/SmartInbox037.tsx`
- `app/transactions.tsx`
- `app/globals.css`

Add new:

- `app/closed-file-download.ts`

Open your existing GitHub repo (`inderbains/crmsocial`) and upload the listed paths under **app/**, not the repository root. Do not replace other source files. This patch has **no SQL**, **no Supabase bucket changes**, **no new npm package**, and **no Edge Function** changes.

## What changed

1. **Back Office → Applications & tools → Transactions & Review:** A fourth **Closed Files** card appears beside Review Queue, Changes Requested, and Approved. On larger desktop widths the four cards share one row. It opens the existing archived-sale view; the same link is in the Back Office sidebar.
2. **Agent:** No additional Closed Files folder. Completed/archived sales remain visible in Transactions > All Transactions and Sales, plus the Workspace > Completed category. Archived files are read-only.
3. **Main-screen notification flow:** A temporary **Notifications** tab appears when there are unread `rv_transaction_notifications` rows. It opens automatically the first time unread notifications are present. Clicking a notification checks that the linked file exists under the signed-in user's permissions, navigates to that exact transaction, then marks that notification read in Supabase. The alert disappears from the main-screen notifications, not from the transaction records. No transaction is deleted.
4. **Agent needs corrections:** Notification opens the source transaction and scrolls to **Changes requested / Resubmit to Back Office** where that action is applicable.
5. **Back Office needs review:** New/updated submitted transaction notification opens the source transaction and scrolls to **Compliance Review / Approve or Request Changes**. Viewing a notification does not approve it; review-queue entries persist separately until resolved.
6. **Back Office ZIP export:** Open Back Office > Closed Files > a closed sale; click **Download all documents (ZIP)**. The archive combines accessible sale attachments, classified closed-file manifest documents including saved CIR/closing PDFs, and the linked original listing's documents. Duplicate paths are included once. The ZIP contains named folders such as Sale Documents, Listing Documents, Firm Sale, and Closing & Accounting. Files are fetched from the private `transaction-files` bucket using the signed-in user's normal Supabase permissions. Export stops with a visible error if any file is denied or unavailable; it does **not** save a misleading incomplete ZIP.
7. **Individual downloads:** Each document row in an archived sale and its linked listing has a **Download** button in addition to Open. Agent and Back Office see this button where their existing document-read permission allows it. Only Back Office receives the bulk ZIP control (which can include internal accounting PDFs).

## ZIP notes

- The ZIP contains original document bytes; PDF, DOCX and images are not modified. It uses standard ZIP packaging without recompressing already compressed documents.
- Browser export limit: up to 500 accessible documents and 250 MB of raw attachment bytes. For larger folders, use individual downloads until server-side ZIP streaming is introduced.
- Private files remain in Supabase Storage; downloading makes a **local copy only**. There is no archive migration, deletion, or public sharing.
- A ZIP may include confidential client IDs and internal brokerage financial records. Only download to a trusted brokerage computer and handle retention securely.

## Verify after deployment

1. Back Office > Applications & tools > Transactions & Review: confirm fourth **Closed Files** card. Open it and find an archived sale.
2. Confirm you can open all authorized closed-file attachments and the linked listing's documents.
3. Click **Download all documents (ZIP)**. Verify downloaded ZIP opens locally and contains actual PDF/document files in folders. Test one individual document download.
4. Agent Workspace > Completed: verify archived sale. Agent Transactions > All Transactions/Sales: archived sale remains visible and read-only; there should be no separate Closed Files sidebar entry for agents.
5. Trigger a test agent submission or resubmission: Back Office Notifications should open that exact file with compliance controls. View clears the notification but **Review Queue** retains it until approval or changes are requested.
6. Trigger Changes Requested on a test deal: agent Notifications should open the actual file with correction and resubmission controls. Viewed alert clears but transaction remains editable while changes are requested.
7. Confirm existing payout/cheque/CIR/accounting flows are unchanged. Archive ZIP actions are download-only.

## Verification performed before packaging

- All modified TSX files parsed/transpiled successfully with TypeScript.
- The new ZIP utility passed a separate TypeScript check.
- A sample 3-document ZIP was generated and verified by Python's `zipfile` reader; checksums and duplicate-name handling passed.
- Targeted source-level checks passed for card placement, notification-to-file routing, the review/correction targets, Supabase read permissions, and download controls.

**Limitations:** The full Next.js build and live authenticated Supabase flows could not be executed in this environment. Current repository tests have pre-existing failures. Test on your deployment before relying on ZIP export for compliance backups; the source files still remain in Supabase Storage regardless.
