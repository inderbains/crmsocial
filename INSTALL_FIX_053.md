# RealVolt Fix 053 — Realtor on file, reminder popup, pre-cheque document release approval

**Built on Fix 052.** Fix 052 must be installed first, including `supabase/052_workflow_and_compliance_safety.sql`. Fix 053 is a separate incremental update. The `closing-packet` Supabase Edge Function already deployed for CIR does **not** need redeployment.

## Changes

1. **Assigned Realtor visible on opened transaction**: every transaction heading shows `Assigned Realtor: [Full name]`, fetched from its assigned agent's `office_agents` profile (or the signed-in agent's personal workspace profile). This is distinct from the seller, buyer, or cooperating Realtor. When no authorized profile name exists, RealVolt shows an explicit missing-name message rather than pretending the client is the agent. No change to ownership or permissions.
2. **Add reminder popup**: clicking `+ Add reminder` opens a centered dialog, not the expanded full-width dashboard form. Fields: reminder, date, optional notes. Save/Cancel/Close, Escape, and click-outside dismiss work. Existing reminders can be edited, completed, reopened or deleted through the same dialog. Reminder data and the Supabase table remain unchanged.
3. **Compliance release gate in cheque register**: a prepared commission cheque displays a compact `Required document review before cheque release` card with counts, missing documents, `Review file compliance` link, and explicit `Approve cheque release` action. `Record Issue` stays disabled until Back Office confirms verified required documents and approves release. The database also checks approval on the real issue RPC, preventing bypass through direct API calls. Changes to documents invalidate the prior sign-off. The internally generated commission payable statement is excluded from the *pre-cheque* checklist because its generation currently depends on payout issuance. Other required documents must be reviewed first.
4. **Normal cheque behavior retained**: preparing and downloading a PDF does not mark the payout Paid. Issuing does. Noncommission trust cheques keep their existing trust controls; this new gate applies to **commission** cheques. The cheque history and already issued cheques remain untouched.

## Install in this order

1. **Back up** Supabase and test on staging before production, especially for existing commission payouts. Confirm **Fix 052** is already installed.
2. Supabase Dashboard → SQL Editor → new query: paste and run the **entire** `supabase/053_pre_cheque_document_approval.sql` file (includes `BEGIN;` and `COMMIT;`). This creates the release approval table and protected RPC functions, and replaces `issue_office_cheque` to enforce the approval gate. It does not delete cheques or payments.
3. GitHub `inderbains/crmsocial`: replace these extracted files **in their corresponding folders**:
   - `app/transactions.tsx`
   - `app/TransactionWorkflow.module.css`
   - `app/personal-dates.tsx`
   - `app/SmartInbox037.module.css`
   - `app/office-cheques.tsx`
   Do **not** upload the ZIP itself, or move files to the repository root. Commit and wait for Hostinger to build.
4. Hard-refresh RealVolt. Open a transaction from Back Office and confirm it shows its assigned Realtor name. Click **Add reminder** and confirm a centered popup; save, edit, complete, and cancel.
5. On a **staging test sale**, ensure actual required documents are correctly linked and manually reviewed. Prepare a test commission cheque. Before release approval, Record Issue must be disabled. Try `Review file compliance`, then after all required documents are verified, click `Approve cheque release`. Confirm the status changes to approved; then use a **test** cheque to verify that `Record Issue` is allowed. Changing any required document should invalidate approval and require a fresh review. **Do not issue a real cheque during testing.**
6. Run `supabase/VERIFY_FIX_053.sql` in the SQL Editor to verify the functions and table exist. Inspect function logs / SQL errors if a failure occurs.

## Critical cautions

- **Do not issue cheque #001 again** simply to test. Fix 053 does not recalculate its GST or alter an already recorded payout. Verify the tax and accounting records separately.
- The pre-cheque gate checks records and blocks clearly unrelated known filenames, but **cannot inspect PDF contents for legal correctness**. A responsible Back Office reviewer must open each document. The approval requires explicit reviewer acknowledgement.
- Do not overwrite the currently deployed `closing-packet` function; this is a transaction UI + SQL patch only.
- Old printed/issued cheques are untouched. No new funds are transferred by this patch.
- Browser behavior and Supabase permissions **still require staging/live verification**. The static source checks passed; existing unrelated repository test failures remain.

## Validation

- Source parsing passed for the updated TSX files.
- `node --test tests/*.test.mjs`: 116 passed, 33 failed (149 tests); the 33 failing tests already existed before the patch, while the three Fix 053 checks pass.
- No live database migration, Hostinger deployment, PDF generation, or real cheque issuance was performed here.
