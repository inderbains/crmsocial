# RealVolt Fix 110 — Combined Fix 109 + agent charges and detailed statements

For installations through Fix 108 (including corrected 108 SQL). Skip the original Fix 109 package. This archive includes both migrations from 109 and the new 110 migration. No Fix 108 transaction, closing-packet or cheque files are replaced. The previously provided 109 instructions describe the inherited functionality and limitations, not a separate installation.

## Supabase SQL Editor
Run entire files separately in order:
1. `supabase/109a_reconciliation_expenses.sql`
2. `supabase/109b_private_agent_expenses.sql`
3. `supabase/110a_agent_charges.sql`
4. `supabase/VERIFY_109_READ_ONLY.sql` (7 true rows)
5. `supabase/VERIFY_110_READ_ONLY.sql` (9 true rows)

If any fails, stop and report the error. Schema verification is not functional testing.

## GitHub
Upload all ten files in `app/` to the existing `app/` folder. Do not place copies at the repository root. No Edge Function changes. Ensure original Fix 108 app and Edge Function deployment are completed separately if not yet done.

## New workflows
- Agent Management > agent profile > Charges & expenses: add one-time board/listing/penalty/other charges owed to brokerage, actual GST (default zero), unique charge reference, and collection method. Existing recurring fees are still managed through plans. Avoid recording the same invoice in multiple tools.
- Commission deduction: select an approved completed sale with confirmed funds and no authorized payout, confirm charge is lawfully owed to brokerage, then assign it. The existing authorization includes the linked charge; paid status follows payout settlement, not assignment. No changes to the actual payout RPC. This is an explicit per-charge assignment, not automatic selection of outstanding fees. Third-party sums requiring separate remittance must not be assigned as brokerage fees. If assigned incorrectly, stop for accounting review; unlink/reassignment is not provided.
- Direct payment: record the genuine receipt once through the existing General ledger workflow, then link that existing exact-amount referenced receipt. No new bank entry or transfer is created here. One receipt per charge; no partial/multi-charge receipts. A reversal is flagged for review. Unallocated unpaid charges can be voided with a reason.
- Agent Transactions > Deductions & expenses: full itemized record including one-time charges, monthly bills, existing transaction deductions and private expenses. Custom from/to dates, category, status, all-time reset, print/PDF via browser and CSV. Separately shows actual paid commission payouts with payment-date filters. Linked one-time and monthly charges excluded from duplicate transaction-deduction rows; ambiguous historical monthly links block consolidated totals for review. Existing commission and GST reports are retained, with a separate date-filtered itemized expense/GST section on the GST view. Charge dates, completion dates and payment dates are not interchangeable. Recorded GST is not an automatic ITC or tax return. Private expenses remain owner-only and are not shown in Back Office.

## Test in a test brokerage
Test inherited 109 workflows described in INSTALL_109.md. Create a one-time charge, verify another agent cannot read it, verify another brokerage admin cannot add/assign it, try duplicate reference, assign to correct completed sale, reject wrong agent and second assignment, authorize payout and confirm status remains Authorized until actual payment, check statement contains charge once. Verify existing monthly fee appears once. Test direct payment exact ledger receipt, reject wrong account/amount and reuse, reverse receipt and check review status. Void an unpaid charge with reason. Verify private expenses remain invisible to other users. Print custom dates and export CSV, test annual and quarterly GST display. Re-test both Fix 108 deposit routes. No live DB or production build tested.

## Limits
Bulk charges, new recurring categories, automatic next-commission selection, invoice file uploads, split expenses, full double-entry statements, bank-compatible EFT batches, statutory payroll and unified payment queue remain pending. Direct receipt linking does not establish revenue or tax classification; review with accountant. Existing external commission route requires separate compliance review. No automatic bank transfers. Do not use for real-money payments before functional testing.
