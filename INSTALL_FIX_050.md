# RealVolt Fix 050 — Different required firm-sale documents for seller vs buyer side

## Changes

When **File action → Remove subjects / mark firm sold** is selected:

| Required for every firm sale | Our listing / seller side (`representation=listing`) | Buyer-side sale (`representation=selling`) |
| --- | --- | --- |
| Signed subject-removal PDF | Trade Record Sheet | Trade Record Sheet |
| Title Search | Sale Report Form | Receipt of Funds |
| PDS | | |
| Deposit Cheque Copy / Receipt | | |

Optional: multiple additional addendums, all accepted formats. For **Subject extension**, keep signed extension PDF + revised date only. **Offer collapsed** remains one confirmation, no document.

The extra required files are collected in the **Transaction actions** form, not as a premature empty checklist. The existing compliance list displays them after the sale is marked firm, where Back Office verifies them.

## Install — in this order

1. Back up Supabase. **SQL 049 must already be installed**, along with 044, 046, 047, 048.
2. Supabase SQL Editor → **New query**. Copy all of `supabase/050_side_specific_firm_documents.sql`, from `DO $rv050_patch$` through `END $rv050_patch$;`, and click Run. Do **not** run an individual highlighted `IF` or `PERFORM`. It is a single SQL statement. This updates the firm-sale rule, seeds brokerage templates for current/future brokerages, and permits the signed-in agent to link **firm-stage files** on a Submitted conditional sale without unlocking other document categories.
3. GitHub repository → `app/`: replace `transaction-actions.tsx` and `staged-document-upload.tsx` with the two files from this package. Do not upload them to the repository root.
4. Commit, allow Hostinger build, and open **two test sales**, one `Our side = Listing / seller side`, one `Selling / buyer side`. Confirm each sees its correct documents, cannot submit with any required file absent, and then verify Back Office sees linked compliance forms after firm sale.
5. Run `supabase/VERIFY_050.sql` and inspect the results. For one brokerage expect listing Trade Record + Sale Report; selling Trade Record + Receipt of Funds, all `required=true, active=true`.

No changes to `transactions.tsx`, commission, lawyers, deal status options or other database migrations. Do not rerun 044–049. The SQL is intentionally one physical statement to avoid prior Supabase SQL editor fragment errors.

## What was tested

Focused source and TSX syntax validation are included. This patch **has not been applied to live Supabase or built by Hostinger**. Test against staging before applying to live client data. If a database error occurs, stop and share its full text.
