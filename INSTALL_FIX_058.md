# RealVolt Fix 058 — Review & Approve Directly from Back Office Notification

**Base:** Fix 056 with Fix 057's Our Realtor correction. Retains Version 6 transaction layout.

## What's changed
- Click a Back Office notification about a *Submitted* file. The exact transaction opens with a full **Review submitted file** panel near the top (instead of jumping to a long compliance section).
- Back Office can check each required document, select an existing attachment, open it, and mark it verified **inside that file**.
- Approve File is disabled until the mandatory document checklist is complete; the existing transaction approval function checks requirements again before saving the approval.
- Request Changes accepts an explanation and sends the file back using the existing review process.
- Admin can expand Documents & uploads from the review panel. Full Compliance & commission remains collapsed by default.
- Fix 057 Our Realtor attribution is kept; the cooperating Realtor is separate.
- Accepted Offer and extension notifications remain status updates with **no extra compliance approval**, as previously requested.

## Upload to GitHub (two files only)
1. Back up `app/transactions.tsx` or keep a copy of your existing repository.
2. In `github.com/inderbains/crmsocial`, **open the `app/` folder**.
3. Upload BOTH updated files inside this ZIP's `app/` folder:
   - `app/transactions.tsx` (replace)
   - `app/direct-file-review.tsx` (new)
4. Commit and let Hostinger build. Do NOT upload these files to the repository root. Do NOT upload the entire ZIP.
5. No new SQL or Supabase Edge Function deployment is required for this UI patch. Existing admin permissions and deal-requirement policies still apply.

## Live test
1. Using a test agent, submit a Listing to Back Office with required documents.
2. Sign in as brokerage admin, go to Dashboard → New files / Activity, click the corresponding notification.
3. Confirm the **correct transaction** opens, with **Review submitted file** at the top.
4. Select and open each required document, check its contents, tick Verified.
5. Confirm Approve File is disabled while any mandatory document is missing; after all required docs are verified, approve directly from the file.
6. Test Request Changes with a reason; agent should receive status `Changes requested`.
7. Test Accepted Offer status notification separately: it should not request another compliance approval.
8. Confirm Version 6 transaction layout and the linked Realtor name remain unchanged.

## Safety
- A document should only be marked Verified after checking its contents. Unrelated agent expense or GST report documents cannot be linked to unrelated required legal forms via the new review selector.
- This patch does not approve anything automatically, send a lawyer email, issue a cheque, or change financial transactions.
- Syntax and source-level checks passed. A full Next.js/Hostinger build and live staging tests have not been performed here.
