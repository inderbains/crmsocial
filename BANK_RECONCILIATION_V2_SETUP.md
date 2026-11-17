# RealVolt Bank Reconciliation v2 — Installation

## Existing code preserved
This update builds on the uploaded RealVolt `crmsocial-main` project. It retains the existing cheque printing, ledger, bank accounts, prior bank matches, CSV imports, agent payouts and approved reconciliation history. **Do not reset Supabase or run the original base schema against an existing database.**

## Installation
1. Back up your Supabase database and current GitHub branch.
2. If migration `010_back_office_finance.sql` is already installed, run the new migration `supabase/migrations/025_bank_reconciliation_v2.sql` once in the Supabase SQL editor (or through your migration pipeline). If older migrations have not been installed, install them in sequence first.
3. Commit and deploy the updated `app/back-office.tsx` and new `app/office-bank-reconciliation.tsx` to your existing Next.js Hostinger website.
4. Open Back Office → Trust & bank and confirm the brokerage accounts, trust file ledgers and opening balances. Open Back Office → Bank reconciliation; select an account.
5. Enter a bank statement ending balance; upload CSV `date,description,amount,reference` (or add signed bank statement lines manually).
6. Match bank statement lines to existing ledger entries. For fees / missing book entries, post the ledger entry first in Trust & bank, then match. **A statement line is not a book entry.**
7. Unmatched **ledger** deposits and issued cheques remain in transit. No fake clearance is required. The app calculates adjusted bank = bank statement + deposits in transit − outstanding cheques. The database calculates it again.
8. For a trust account, the database checks the control ledger against the sum of transaction trust liabilities and disallows negative file balances at approval.
9. Click **Prepare reconciliation**, then sign in as a **different authorized brokerage admin** to click **Review & approve**. The older one-step sign-off RPC is no longer accessible to ordinary authenticated users.
10. Confirm the reconciliation appears under Approved reconciliation history. Only after reconciling all relevant accounts for a period may authorized office users lock the period from the existing workflow, if appropriate.

## Security and bookkeeping notes
- Reconciliations, manual bank lines, and approvals use authenticated Supabase RPCs with server-side brokerage checks. Audit records are created using the existing `audit_office_change()` trigger.
- An approved period freezes modifications to bank statements and ledger. A cheque issued during a closed month may still be matched against its **later bank clearance date**, without rewriting the old approval.
- The second reviewer is currently verified as a *different brokerage administrator*, not as a BCFSA licence-specific managing broker. **Before production compliance use**, add a verified managing-broker designation/authorization check for the approving user.
- Bank CSV dates and amounts must be validated; existing CSV importer skips duplicate fingerprints. Manual entries have separate unique identifiers and are not de-duplicated automatically.
- A text reconciliation worksheet can be downloaded. Bank statement PDFs, formal signed PDF packages, multiple-statement imports, corrections/voids to mistakenly entered bank lines, and bank API connections are not yet implemented. Keep original statements and supporting evidence externally until an attachment workflow is built.
- This upgrade has not been applied to a live Supabase database or deployed to Hostinger by this package. Run tests and have a BC brokerage accountant/qualified professional review financial procedures before handling real trust money.
