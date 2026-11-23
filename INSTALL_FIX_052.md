# RealVolt Fix 052 — Connected Closing Workflow
**Base:** the user's uploaded `crmsocial-main (7).zip` (2026-11-22).

## What this changes

1. **Compact transaction page:** a five-step panel (File Actions → Documents → Compliance → Commission → Closing & CIR); the long sections are shown in one selected panel at a time. Each component is instantiated only once by `app/transactions.tsx`. Selected archived sales open in **Closed folder**.
2. **Connected payment workflow:** from the agent commission step click **Continue to Agent Payments**. Back Office opens that deal preselected. Authorize the payout, then select **Pay by cheque** or **Pay by EFT**. Cheque printing preselects the eligible payout when possible, and cheque alignment settings are collapsed. **Only after Record Issue succeeds** does the user return to the transaction's Closing step with a clear **Close & archive** action. Downloading/printing a cheque PDF is **not** recorded as payment.
3. **Closed files:** Back Office > Transactions & Review > Closed files lists archived transactions. Opening an archived sale shows its read-only folder based on the existing `rv_closed_file_folders` table from migration 044. No new storage bucket and no documents removed.
4. **Closing PDFs:** *Brokerage completion confirmation* can be generated after legal completion, without waiting for the agent to be paid. *Internal commission payable statement* still requires recorded `Paid` payout. CIR preview and save remain on the previously deployed `closing-packet` Edge Function. Generated PDFs must still be verified in Compliance.
5. **GST display and fee charges:** shows the current agent profile registration/rate and warns when GST is $0 because the agent GST number is missing. The existing `apply_agent_split` server RPC remains the authoritative commission/GST calculation; we do **not** silently add GST to an existing paid cheque. For new office charges, an explicit applicable-GST checkbox computes GST from the agent profile fee GST rate. Check whether GST applies to each charge.
6. **Document safety:** known unrelated reports (e.g. `AGENTEXPENSESBYDATE` and `AGENTGSTREPORT`) are hidden from the relevant legal checklist selectors and cannot be re-verified. Verification requires explicit reviewer confirmation. The SQL patch marks existing clearly mismatched verifications unverified **without deleting documents**, and adds a database guard. It does not claim to prove a generic filename's content: Back Office must still read every document.
7. **Correct seller/buyer forms from the earlier request:** for **our listing / seller side**, require **Trade Record Sheet + Receipt of Funds**. For **buyer side**, require **Trade Record Sheet + Sale Report Form**. Other subject-removal requirements remain (signed removal, title, PDS, cheque/receipt). Migration 052 changes templates and old checklist entries to match. Old attachments remain available for audit.

## Install — use staging first

**Back up the Supabase database first.** Fix 052 assumes migrations 044 through 050 were installed and the `closing-packet` Edge Function was already deployed, which it was in the conversation. This package contains no changes to the Edge Function. It does **not** run migrations automatically.

1. **Run** `supabase/052_workflow_and_compliance_safety.sql` in the **Supabase SQL Editor**, on a *staging clone* first, as one complete DO statement. After inspecting the staging result, repeat in the correct production project only after a database backup. It updates rules and deliberately un-verifies **suspect** historical checklist entries. This may reduce the previously displayed 12/12 compliance score; that is intentional until the correct files have been linked/verified.
2. In GitHub, replace the matching files under their **exact relative paths** (do not upload to repository root):
   - `app/realvolt-workspace.tsx`
   - `app/transactions.tsx`
   - `app/TransactionWorkflow.module.css` (new)
   - `app/deal-admin.tsx`
   - `app/back-office.tsx`
   - `app/office-cheques.tsx`
   - `app/compliance-closing-panel.tsx`
   - `app/transaction-actions.tsx`
   - `lib/compliance-document-match.ts` (new)
3. Commit and run the normal Hostinger build/deployment. The deployed `closing-packet` Supabase Function should stay as-is; no extra Edge Function deploy is required.
4. Refresh RealVolt **with a hard reload**. Ensure only one workflow panel is visible. In Back Office test `Review queue`, `Approved`, and the new `Closed files` menu.
5. On a **new staging sale**, test the selected seller/listing side and buyer/selling side subject-removal forms; verify the expected required documents.
6. On a completed staging sale, verify document mismatches are blocked, regenerate only missing PDFs, confirm the commission allocation and agent GST settings, then navigate to Agent Payments. Authorize and prepare a **test** cheque. **Do not issue a real cheque** just to test. Only a successfully recorded test issue should return you to Closing. Confirm Close & archive fails while a mandatory document is missing, succeeds after completion, and moves the transaction to **Closed files**.
7. Repeat GST and fee deductions tests with **registered** and **not registered** agent profiles; never assume 5% applies if the agent is not required or authorized to charge it.

## Important financial/accounting limitations

- **Existing prepared, issued or paid cheques are never rewritten by this patch.** If an old cheque shows $0 GST, its net amount does not change; review the tax registration and correct the existing payout through an appropriately authorized reversal/adjustment process, keeping the audit history. Do not delete a payout from SQL manually.
- **Record Issue** is the existing system's payment-recording event; it is not necessarily proof that a cheque has cleared the bank. Use bank reconciliation separately. You should not close a real file before required financial checks have been completed.
- Mismatched documents might have generic filenames and still appear plausible. File-name checks are not legal verification. A brokerage administrator must open and review every required attachment before setting `Verified`.
- Only a live database and browser test can confirm that the historical duplicates in the screenshots are gone. The uploaded `(7)` source already contained only one of each component, so the patch also changes mounting/display structure and consolidates each to one selected step. If duplicates persist after deploying this exact source and clearing the browser cache, compare the deployed Git commit and browser console.

## Checks performed

- Targeted TypeScript/TSX parsing: successful for every updated source file.
- Added `tests/transaction-workflow-052.test.mjs` with 5 passing assertions for the connected flow, archive route, GST/document rules and gated PDF generation.
- Full existing `node --test tests/*.test.mjs`: **108 passed / 33 failed / 141 total** on the original `(7)` base; the patched source returned to the same pass/fail result (33 baseline failures). Full Next.js build and Supabase live/staging run were **not** available in this environment because the required npm dependencies were not installed/offline.

## Troubleshooting

- If `Close & archive` reports missing required forms, open the **Compliance** step to review those items; do not simply mark unrelated files as verified.
- If GST is $0, confirm agent GST registration number and commission GST rate in **Back Office → Agents & profiles** before starting a *new* authorization. Existing issued payments are immutable audit records.
- If the cheque section shows no payout, confirm the selected transaction is Completed/Approved, commission funds verified, and payout **Authorized**, then select an Operating account.
- For actual bank settlement and cheque-clearing verification, use **Trust & bank / Bank reconciliation** separately.
