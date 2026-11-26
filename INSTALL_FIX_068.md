# RealVolt Fix 068 — Accepted Offer or Direct Sold at conversion

**Base:** current Version 9 / Fix 067 agent transaction screen, Fix 065 read-only Back Office review, Fix 059 firm-sale workflow, and Fix 063 Accepted Offer templates. Preserve the Version 6-style layout.

## Changes

- On **Add Sale** or **Accepted Offer / Create Sale** from an approved listing, choose **Accepted Offer (subjects outstanding)** or **Direct Sold (unconditional, no subjects)** *before saving*.
- Required Accepted Offer documents are selected on that same form: signed CPS, Commission Disclosure, representation disclosure, and the appropriate buyer/seller ID files. Optional addenda can be uploaded there too.
- When choosing Direct Sold, **Continue to Direct Sold** saves/links the required offer documents and immediately opens the existing 3-step firm-sale wizard (firm documents → commissions/GST and deposit holder → both lawyers). Only its final submission sends the firm sale to Back Office for approval. The offer stage itself does not require approval.
- The normal agent All Files view displays the linked sale in place of the original listing while the sale is active, to avoid a confusing Active Listing + Accepted Offer Draft pair. **No database records are deleted or merged**. The original listing remains accessible from the Listings section and via its linked transaction reference.
- Displays **Realtor** instead of **Our Realtor**, using the file-owning agent profile. The other brokerage's cooperating Realtor is still distinguished in commission and lawyer details.
- Keeps Fix 065's document assignment locked in Back Office; the administrator only verifies or requests corrections.
- Extra IDs under the same buyer/seller identity requirement are supported by the small 068 SQL update. Each extra ID is a separate review item. The required first ID is not made optional.

## Files to upload to GitHub

Open `github.com/inderbains/crmsocial` → **app** → **Add file → Upload files** and replace these **four** files from the ZIP's `app` folder:

- `app/transactions.tsx`
- `app/transaction-actions.tsx`
- `app/direct-file-review.tsx`
- `app/post-firm-details.tsx`

Do not upload the ZIP or any files at the repository root. Don't overwrite any other application files. Commit, then confirm Hostinger's TypeScript and publish steps succeed.

## Supabase (first, after backup and staging test)

1. Run `supabase/VERIFY_068_READ_ONLY.sql` to check whether the Fix 063 guard exists and the Accepted Offer templates are required for both buyer and seller sides.
2. **Only if Fix 063 isn't installed:** follow its prerequisites and run `063_required_accepted_offer_then_firm_review.sql` from this ZIP. Don't rerun it if already installed and correct.
3. Run `068_additional_id_uploads.sql` **after** Fix 063, to allow multiple identity files to be categorized correctly. Do not copy SQL into GitHub expecting it to execute: use Supabase SQL Editor.
4. Rerun the read-only check.

No Supabase Edge Function deployment or CIR change is needed.

## Test on staging

- Approved active listing → Accepted Offer with subjects: without mandatory CPS/Commission Disclosure/Representation Disclosure/ID, Save is blocked; with them, a single accepted-sale entry appears in All Files, while the listing remains accessible under Listings. Back Office receives a status/documents notice but doesn't require approval.
- Approved listing → Direct Sold: same required offer documents; choose Direct Sold and click Continue. The 3-step firm-sale form opens immediately with **Direct sold** preselected. Upload the unconditional contract, title, PDS, cheque, trade record, Sale Report Form, Receipt of Funds, plus addenda as appropriate. Enter commissions (listing + selling side for linked listings), GST rate, deposit amount/holder, and buyer/seller lawyers. **Submit** routes the complete file for Back Office approval.
- Buyer-side Add Sale: required buyer IDs; single represented-side commission at firm stage; optional additional IDs and addenda.
- Verify a submitted file in Back Office by opening the agent-linked documents, without reassignment dropdowns.
- Offer collapse leaves the audit-linked listing accessible again. Check one existing historic file is still visible.

### Known boundaries

- The sale and its underlying listing remain separate database records to protect history. This patch groups them in the normal All Files list, not in every report or status query.
- Direct Sold uses a continuous two-part on-screen flow. Required Accepted Offer documents are persisted before the final Firm Sale submission; if the second half is abandoned, an Accepted Offer draft remains with its saved documents, available to resume. This is not a single atomic database transaction.
- The Full Next.js production build, current Supabase permissions, and live email delivery have **not** been verified here. Do not assume deployment has succeeded until the staging tests pass.
