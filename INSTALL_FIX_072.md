# RealVolt Fix 072 — Commission / GST test and on-file payout

**Base:** the Fix 071 `app/transactions.tsx` workflow with the existing Back Office cheque and compliance modules. This is a patch, not a complete project. Preserve the rest of your GitHub repository.

## Files to upload to GitHub

In `github.com/inderbains/crmsocial/tree/main/app`, upload **only**:

1. `app/transactions.tsx` — moves post-completion payout onto the transaction and moves closing actions to the bottom.
2. `app/transaction-commission-payout.tsx` — **new** transaction-level receipt, commission calculation, payout and cheque panel.
3. `app/deal-admin.tsx` — commission-only mode, GST calculation preview, taxable deal-fee GST calculation and optional correction of existing deal-fee GST.
4. `app/office-cheques.tsx` — limits the on-transaction register and authorization selector to the active transaction; keeps existing cheque issue/release safeguards.

**Never upload them to repository root.** Do not upload the ZIP file itself. Commit after replacing/adding these four app files.

## SQL (back up, test on staging, then apply if approved)

Run `supabase/072_optional_internal_pdfs.sql` in Supabase SQL Editor. This:

- Makes only these *internal brokerage-generated* documents optional for review and archive: Brokerage Completion Confirmation, CIR, Internal Commission Payable Statement. Existing agent/firm-sale documents, lawyer letter and actual paid-payout requirements are **not** made optional.
- Removes the hardcoded archive requirement for those internal PDFs while retaining the other audit/compliance safeguards.
- Adds a permission-checked **atomic** `rv072_receive_commission_funds` function for an **actual** commission deposit received when another brokerage holds the deposit. It posts a positive entry to the selected operating account ledger and verifies funds together. It **does not** import or reconcile a bank statement for you.

Check with `supabase/VERIFY_072_READ_ONLY.sql` afterward. These instructions assume earlier migrations through Fix 071 (including the cheque release gate) already ran. In particular, `rv_close_compliant_file`, `rv_compliance_archive_guard`, `rv_tx_action`, `post_office_entry`, and `rv_release_gate_status` must already exist.

## GST testing behavior

- The page **previews 5% GST on agent commission** even if the agent's GST registration details are not yet finalized. This is labeled **testing preview only** and does not modify the saved allocation, authorized payout or ledger.
- Actual agent GST paid in a recorded payout still comes from the **verified agent profile and existing `apply_agent_split` server calculation**. An unregistered agent should not be falsely paid a GST line.
- For **new** office deductions or fees, the admin must select **Taxable brokerage fee (5% GST)** when it applies; the GST amount then calculates and saves automatically. This checkbox defaults off for general deductions and on when the category is changed to Office fee.
- For an **existing** deal-fee line with zero GST, the admin can review it and explicitly click **Apply 5% GST to deal fee** before payout authorization. Avoid applying it twice; the button disappears once GST is recorded.
- Previously authorized payouts and printed cheques are **not** silently recalculated.

## Test the real workflow on staging

1. Open an approved sale, confirm Legal Completion and attach the actual lawyer completion letter.
2. If deposit is held by **another brokerage**, choose an operating account, type the **actual** commission deposit amount/date/bank reference and confirm the real receipt. The same SQL transaction posts one ledger receipt and marks funds verified; the amount must match the represented-side commission plus GST saved on the transaction. **Do not use invented deposits on a live operating ledger.**
3. If deposit is held by **our brokerage**, first record trust receipt / authorized commission transfer via the existing Trust & Bank workflow. Verify its real reference before confirming commission funds on the transaction page. The new code does not move trust money automatically.
4. Calculate the agent split. Examine the saved GST and the distinct test-preview GST. Review / add any taxable fee GST before authorization.
5. Click **Authorize payout with deductions**. Prepare the cheque directly below on the same transaction. Downloading the PDF is not payment.
6. Check required-document release gate; Back Office approves release; click **Record Issue** *only after* signing and releasing the cheque. The existing cheque issue RPC records the paid payout and ledger entry.
7. Open Bank Reconciliation and match both the operating deposit (if recorded) and the cheque payment against imported bank statement lines. Creating a ledger entry is not reconciling it.
8. Expand optional final-document tools as needed, then Close/Archive from the **bottom** of the transaction when all non-optional conditions are satisfied.

## Safety/validation and limits

- The JSX/TSX files passed local TypeScript **syntax** parsing. The repository test suite returned **110 passed / 39 failed**, identical to the available base; these existing failures have not been resolved.
- The npm install for a full Next.js build is unavailable offline because `@supabase/ssr` was not cached. **Hostinger build and a staging integration test remain mandatory** before production use.
- The SQL has been statically inspected, **not executed against your Supabase database**.
- This patch does not add EFT processing to the transaction itself, automate trust disbursement, or import bank statements. Existing separate EFT and bank reconciliation features are retained.
- Do not test with fictitious receipts, issued cheques, or GST paid to an unregistered agent in the live brokerage accounting database.
