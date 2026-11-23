# RealVolt Fix 055 — Submitted → Reviewed → Approved, then next stage

**Base:** the owner's `crmsocial-main (6).zip` transaction layout, with the Add Reminder modal and Assigned Realtor line from Fix 054. This ZIP **supersedes** the UI part of Fix 054; do not install both. It is a targeted update, **not a full-project replacement**.

## Workflow implemented in this patch

1. **New listing:** Signed Multiple Listing Contract, listing disclosure, and at least one ID are required to submit. More ID documents and any number of listing addenda can be uploaded. MLS sheet remains available but not mandatory by default.
2. **New sale starts as `Accepted offer`** (the existing database insert guard already sets this). Required documents are signed Contract of Purchase and Sale, commission disclosure, representation/services disclosure, and at least one ID of the represented party. Further IDs and contract addenda are supported. **Agent clicks Submit to Back Office**, which notifies the assigned reviewer. Approval is not automatic.
3. **Back Office reviews and verifies** the specific linked documents, then clicks `Approve file` or `Request changes`. Unrelated Agent Expense / GST reports are flagged and cannot newly be verified against legal requirements from the checklist. The arbitrary document picker is removed; upload under the correct category instead.
4. **Only after accepted-offer approval:** the agent may choose `Remove subjects / direct sold` and selects **Subjects removed** or **Direct sold — unconditional offer / no subjects**. A direct sold file uses the signed unconditional contract in place of a subject-removal notice. Either route produces one firm-sale record and submits it for review.
5. **Firm-sale documents:** signed removal/unconditional contract, Title, PDS, deposit cheque/receipt, Trade Record, Receipt of Funds, and, for the brokerage's listing side, Sale Report Form. Multiple addenda are available. The agent must then save buyer/seller lawyer contacts, both commission amounts, the GST rate, deposit amount and who holds it.
6. **Firm-sale approval cannot be given** until the post-firm legal, commission and deposit details have been saved. Back Office must still verify each required file. Subject extension continues to require signed PDF + new date. Collapse remains a no-document action.
7. **After approval**, the existing Back Office CIR panel uses the saved data; the admin previews, selects approved lawyer documents, saves the CIR and explicitly emails the lawyer via the already deployed `closing-packet` Edge Function. The document view refreshes after saving. Legal completion and commission verification remain admin-only.
8. **Agent payout, cheque release and archive** remain under existing Back Office accounting controls, including any Fix 053 pre-cheque approval SQL already installed. **A prepared cheque is not a paid cheque.** Deposit held by your brokerage must be recorded against the actual trust receipt in `Trust & bank`; entering a deposit amount does not move funds.

## Install — GitHub folder paths matter

1. Back up the branch and Supabase database; **test on staging** with realistic Listing, buyer-side Sale, seller-side Sale, direct unconditional Sale and Subject Extension before live deployment.
2. Ensure migrations **044, 046, 047, 048, 049, 050** were installed previously. If using cheque pre-issue approval, retain the separate Fix 053 migration. Do not rerun old migrations.
3. In Supabase **SQL Editor**, run **all** of `supabase/055_sale_submission_review_documents.sql` as a single query; do not run fragments. It adds brokerage templates, a safe multi-ID linking function, and two server-side approval/stage guards. It does not delete any existing transaction.
4. In GitHub, **open the `app/` folder** and replace these **seven files within `app/`**:
   - `app/transactions.tsx`
   - `app/transaction-actions.tsx`
   - `app/staged-document-upload.tsx`
   - `app/post-firm-details.tsx`
   - `app/deal-admin.tsx`
   - `app/personal-dates.tsx` (the reminder popup)
   - `app/SmartInbox037.module.css` (popup styling)
5. Add `supabase/055_sale_submission_review_documents.sql` under your repository's `supabase/` folder for history (running SQL in the Supabase SQL Editor is the deployment step for the database).
6. **Do not** upload these `.tsx` files to the repository root. If previous attempts left mistaken root-level `transactions.tsx`, `office-cheques.tsx` or `personal-dates.tsx`, remove those root copies only after confirming their correct counterparts already exist under `app/`.
7. Commit; check the **entire** Hostinger build (TypeScript must also pass), then hard-refresh the site. No new `closing-packet` Edge Function deploy is required.

## Test before moving real money

- Create a listing, upload the listing contract, disclosure, two IDs, and two addenda; submit; verify every file; approve. The agent cannot approve their own file.
- Create a buyer-side Sale. Before approval, subject-removal action is unavailable. Upload CPS, commission disclosure, representation disclosure and multiple IDs; Submit → Back Office verify → Approve.
- Mark that offer firm as (a) subjects removed and (b) direct unconditional in two test deals. Check every mandatory firm upload, Receipt of Funds for both sides, and seller-side Sale Report. Test missing document blocks approval.
- Save post-firm lawyers, GST, commission and deposit; make sure firm approval is blocked without it, then approve after verifying actual files.
- Confirm the CIR panel is accessible to Back Office, excludes IDs/expense reports, and retains human review before sending. Verify the commission and payable amounts against the transaction and registered agent profile.
- Confirm an extension requires a PDF/date; collapsed closes without a document. Confirm reminder uses a popup and name comes from the Realtor's agent profile.
- Before issuing any cheque, review its gross commission, GST, approved deductions, compliance release and net amount; check the trust ledger only against confirmed bank receipt.

## Limits / not silently automated

- **Back Office approval is intentional and never automatic.** Only status progression, requirements, notifications and review routing are automated.
- **Board email dispatch after managing broker signature** still requires a verified signature/board destination and an email sending integration. This patch does not email a board recipient without configuration or proof of signing.
- CIR email is already supported but remains a deliberate **review-and-send** operation rather than silently sending to a lawyer when an agent changes status.
- The database records the chosen deposit holder, but **does not assume money has arrived in trust**; that must be reconciled to a real receipt.
- Agent GST on payout is still driven by the agent's verified GST registration and commission rate in the agent profile; this patch does not retroactively fix previously prepared or paid cheques.
- TypeScript/TSX syntax checks passed. Repository tests: **108 passed, 33 failed** in both the submitted `(6)` baseline and this patched source. **Live TypeScript build, database migration, and end-to-end approval tests have not been run** here. No claim of production bug-free operation is made.
