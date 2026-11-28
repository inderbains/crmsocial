# RealVolt Fix 109 — Consolidated Back Office and expense reporting

This patch is based on the supplied repository snapshot plus Fix 105's Back Office file. Fix 108 transaction settlement, lawyer email, and cheque implementation files are not replaced. Install only after completing the earlier fixes.

## Supabase SQL Editor
Run each entire file in a separate query:
1. `supabase/109a_reconciliation_expenses.sql`
2. `supabase/109b_private_agent_expenses.sql`
3. `supabase/VERIFY_109_READ_ONLY.sql` — seven rows should be true. These are schema checks, not transaction tests.

## GitHub
Replace the five existing app files, and add the two new app files, preserving the exact `app/` paths in the archive. No root-level copies. No Edge Function changes.

## Test first in a test brokerage
- Verify all eight consolidated dashboard cards and their internal links. Existing navigation destinations and accounting tools are retained. Payment Centre groups the existing cheque and EFT pages; it does not create a new shared payment queue.
- Import a test General-account statement, select an unmatched genuine expense (e.g. $105.00), record category/vendor/GST ($5.00) and invoice reference. Verify one negative $105.00 ledger entry and one bank match. Attempt the same line again; it should be rejected. Try an already posted same-amount entry; match rather than repost. Test locked periods, unauthorized users, another brokerage, and Trust withdrawals (must not be posted as operating expenses).
- In Reports, select the year and check the new recorded expense summary and CSV. Check expense reversals in their posting year.
- In Transactions > Deductions & expenses, add a private expense. Verify it appears on that agent's expense and GST views, and cannot be read by another agent or brokerage admin. Test quarters and actual completion dates. Private expense records are separate from brokerage books. Do not enter brokerage charges twice.
- Test both Fix 108 settlement routes independently; their code was not changed.

## Scope and limits
Categorizes one complete General withdrawal at a time; no bank statement split allocations, attachment upload, formal chart-of-accounts master or double-entry financial statements yet. Invoice references are stored; supporting documents should be kept separately. Agent reports summarize recorded commission/charge GST and private-expense GST separately; not eligible input tax credits, GST filing or a full tax statement. Existing agent commission reports use confirmed completion and verified funds, not actual payout date. Existing EFT/cheque flows are grouped without changing routing or creating actual bank transfers. Bank-specific EFT export, unified payment queue, settlement matching automation, payroll statutory deductions and external-commission routing compliance are not delivered here. No production build or live SQL execution was available; verify in test environment before relying on the patch.
