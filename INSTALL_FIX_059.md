# RealVolt Fix 059 — One Firm-Sale Submission

This is a **small patch**, not a full repository ZIP. It preserves the Version 6 transaction layout and the Fix 058 direct in-file Back Office review. No change to your deployed `closing-packet` function.

## What changes

- Accepted Offer is **notification-only**; its optional uploads are attached to the file, not submitted for a separate compliance approval.
- **Subject Removal / Direct Sold** is one step-by-step form: (1) required documents, including multiple addenda; (2) commission + applicable GST and required deposit holder; (3) buyer and seller lawyers. Only the third step has the **final Submit** button.
- Linked listing converted to sold (`parent_listing_id` present): listing-side **and** selling-side commission before GST are recorded. The file-owner Realtor is distinct from the cooperating Realtor. This does **not** automatically create two payable agents; the current payment table supports only one authorized payout per sale file.
- Sale-only file (no linked listing): one represented-side Realtor commission, not an additional second commission.
- Commissions, GST, deposit holder and both lawyers are saved with the firm-stage action in one database transaction. If financial validation fails, the status change rolls back.
- A deposit held by our brokerage **must still be physically received and matched in Trust & Bank**. Selecting a holder is not evidence of bank receipt.
- Back Office must review documents and approve; the existing CIR generator and payment controls are unchanged.

## Install in order

1. Back up Supabase and test on staging first. Requires installed SQL through 056 and the Fix 058 direct review UI if you want notification-click approval.
2. Supabase SQL Editor: Run the whole `supabase/059_one_submit_firm_sale_commission_lawyers.sql` file in one query. This creates a new authenticated-only RPC without modifying old transaction records.
3. GitHub repository `inderbains/crmsocial` → **app** folder: replace **only** these three files from this package's `app` folder:
   - `transaction-actions.tsx`
   - `post-firm-details.tsx`
   - `staged-document-upload.tsx`
4. Commit. Do not upload the files to the repository root. Deploy Hostinger, verify `next build --webpack` and TypeScript pass.
5. Test a **standalone sale** (one Realtor-side commission) and a **converted listing sale** (two sides). For each, test a missing document, missing deposit holder, missing lawyer, valid final submission, admin notification-click review and proper compliance approval.
6. Test both deposit-holder choices and inspect the CIR preview. Do not book trust receipts until bank verification. Do not issue cheques from sample/test commission values.

## Validation / limitations

- Updated components passed TypeScript TSX transpilation/syntax checks and 13 source-level workflow assertions.
- Repository tests: 113 passing / 34 failing. The base (prior to direct review) had 114 passing / 33 failing; one existing static test expects an inline `Approve file` button in `transactions.tsx`, whereas Fix 058 moved it to `direct-file-review.tsx`. Other failures are pre-existing. No full Next.js build was possible in this environment because npm dependencies were not cached offline.
- No live Supabase SQL execution or Hostinger deployment was performed.
- The commission/GST entered here is the **deal/brokerage-side commission**. Agent payout GST is separately calculated according to the agent's tax-registration/profile settings. It must not automatically be charged for an agent who is not eligible to charge GST.
- Current DB schema restricts payouts to **one payout per sale file**. Supporting two *internal* agents being paid separately for a double-ended brokerage deal needs a future database/payout migration; this patch does not pretend those two payments are already supported.
