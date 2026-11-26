# RealVolt Fix 073 — Automatic commission receipt → Operating ledger

**Base:** Fix 072. Small patch only; preserves Version 6 transaction layout and agent submission flow.

## Why the existing transaction is blocked

The older **Verify commission receipt** action changed `deal_files.rv_funds_verified` but did **not** create an `office_ledger` entry. Fix 072 then correctly refused to authorize an agent payout because the verified commission had no linked Operating-bank deposit. **Do not make a second manual deposit.**

## GitHub: replace only two files in `app/`

- `app/transaction-commission-payout.tsx`
- `app/transaction-actions.tsx`

Upload the extracted files inside GitHub's **app** folder, never to repository root. Leave all other files untouched. Commit once.

## Supabase: one SQL migration

1. Back up your Supabase database and test in staging first.
2. Confirm Fix 072's prerequisite tables/functions exist, including `office_bank_accounts`, `office_ledger`, `post_office_entry`, `rv_tx_action` and `rv072_receive_commission_funds`.
3. In Supabase SQL Editor run `supabase/073_auto_commission_receipt_to_operating.sql`.
4. Run `supabase/VERIFY_073_READ_ONLY.sql`. Both checks should return `installed = true`.
5. Deploy the GitHub changes and check the Hostinger build.

## For the existing $14,000 + $700 = $14,700 file

1. Open the **Completed** transaction → **Commission & Agent Payout**.
2. You will see **Finish linking verified commission to the operating bank ledger** if the file was already marked verified with no ledger receipt.
3. Confirm the real money was deposited. Select the actual receiving Operating account, enter the real deposit date and cheque/EFT bank reference. The **$14,700** expected amount is filled from the saved commission and 5% brokerage GST.
4. Click **Link verified receipt to accounting**. One atomic database action creates exactly **one** positive `office_ledger` entry tied to the transaction. No new `rv_funds_verified` action is performed for an already-verified file.
5. Refresh and confirm the receipt is shown as linked. Continue the commission allocation and agent payout steps. Import/match the bank statement line separately under **Bank Reconciliation**.

## For future completed transactions

The only way to verify funds from an **other-brokerage-held deposit** is now the **Confirm receipt & automatically post to accounting** action in the payout panel. The redundant old **Verify commission receipt** transaction dropdown action is removed. This inserts an Operating receipt and updates `rv_funds_verified` in the same SQL transaction.

- The SQL rejects duplicate positive Operating receipts for the same transaction (an exact retry is idempotent).
- The SQL requires completed/approved sale, lawyer completion letter, brokerage admin, operating account in the same brokerage, actual date/reference, and the amount to equal the saved represented-side commission **plus applicable brokerage GST**.
- A database trigger prevents another caller using the old transaction action to mark an external receipt verified without its ledger entry.
- For deposits held in **our own brokerage trust**, the existing trust receipt/authorized transfer workflow stays unchanged; it does **not** post an artificial second receipt.
- Ledger posting means **a RealVolt bookkeeping entry**, not a real bank transfer and not reconciliation. GST paid to an individual Realtor remains governed by their verified registration settings, not by this brokerage-level 5% commission receipt.

## Validation status

Both TSX components passed TypeScript syntax transpilation. The available repository tests remained **110 passing / 39 failing**, unchanged from Fix 072. The PostgreSQL migration was statically reviewed but **not executed** against your live database; a real staging SQL test and Hostinger build are still required. Do not test with fictitious money in production.
