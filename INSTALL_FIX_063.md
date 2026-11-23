# RealVolt Fix 063 — Required Accepted Offer attachments, single firm-sale review

Base: Fix 061 agent flow (Fix 062 category repair is a prerequisite). Preserves the Version 6 design, direct Back Office review, lawyer/commission/deposit wizard and CIR generation.

## Changes

- **Accepted Offer (no approval at this stage):** Contract of Purchase and Sale, Commission Disclosure, Disclosure of Services/Representation, and the applicable buyer or seller FINTRAC identity-document category are **required**. Contract addenda are optional and can be uploaded multiple times. Documents remain linked to the same transaction.
- **Back Office visibility:** A conditional Accepted Offer is visible to its **assigned brokerage reviewer** as an informational file even while its `review_status` is Draft. The agent's upload completion generates a one-time notification. The admin does **not** need to approve the conditional offer.
- **Firm Sale / Subjects Removed:** Cannot move to Sold while mandatory Accepted Offer documents are missing, even if all firm-stage files have been selected. After the firm-sale submission, Back Office opens the same transaction in direct approval mode and verifies **Accepted Offer + Subject Removal documents together**.
- **Custom named document:** “Add another document” is **above** the attachment list and standard upload checklist. Custom named files are linked as *optional* compliance-review rows, with the original storage file retained. They never auto-verify.
- **Unchanged:** realtor identity, multiple addenda, commission + GST, deposit holder, lawyer form, CIR, and payment/accounting flows.

## Install (order matters)

1. **Backup Supabase and test on staging first.** Confirm Fix 056, Fix 059 and Fix 062 SQL are installed. These scripts are not alternatives to those dependencies.
2. Supabase SQL Editor: run the **entire** `supabase/063_required_accepted_offer_then_firm_review.sql`. It changes Accepted Offer template requirements, the assigned admin's read permission for *Draft Accepted Offer files only*, and adds the protective stage guard and notifications.
3. Run `supabase/VERIFY_063_READ_ONLY.sql` to verify the templates and currently linked Accepted Offer documents. IDs and disclosure templates should be required; optional addendum should remain optional.
4. GitHub repository > **app/** folder: replace these **four application files only**:
   - `transactions.tsx`
   - `transaction-actions.tsx`
   - `staged-document-upload.tsx`
   - `direct-file-review.tsx`

   **Do not upload these to the repository root** and do not upload the SQL into `app/`.
5. Commit changes once and deploy through Hostinger. A successful Next.js build must still be confirmed.

## Test with a new sale (prefer staging)

1. Agent creates a Sale: **Accepted Offer**. Back Office receives an *informational* notification; it can open the file but no approval is needed.
2. Open **Documents & uploads**. The custom-name/Add Document control should appear **above** the existing file list and standard checklist.
3. Confirm CPS, Commission Disclosure, Disclosure of Services and buyer/seller ID categories show **Required**, and addendum remains **Optional**. Upload the mandatory forms using their proper categories. Don't link unrelated PDFs just to satisfy a checklist.
4. Back Office should see the attached files on the same transaction; completing all required Accepted Offer uploads should generate an informational notification.
5. Try Subject Removal / Direct Sold without one mandatory Accepted Offer file: it must fail with a clear missing-document message.
6. Complete Accepted Offer docs, then submit the existing firm wizard (firm documents → commissions/GST and deposit holder → lawyers → one submission).
7. Admin opens the new **Submitted** notification: direct review should show **both** Accepted Offer and Firm Sale required rows, plus any optional custom-named docs, all awaiting actual verification. Admin can approve only after verifying or formally waiving eligible requirements.

## Important

- The accepted-offer stage remains **Draft / informational** in `review_status` until firm-sale submission. It is not auto-approved and does not create a second compliance cycle.
- FINTRAC identity documents are private. They must **not** be automatically attached to lawyer/CIR emails.
- Past bad test-file links (such as a completion letter linked as CPS) are **not auto-corrected**. An administrator must verify actual document contents at firm review. No file is marked Verified by this patch.
- SQL was statically reviewed, but not run against your live Supabase project. TypeScript syntax has been checked, but a full Hostinger/Next.js build is still required.
- This patch is *not* the separate pre-existing issue of Back Office queue reviewer assignments missing; ensure each agent has an assigned eligible brokerage reviewer.
