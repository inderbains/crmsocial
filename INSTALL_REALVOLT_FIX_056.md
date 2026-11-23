# RealVolt Fix 056 — Version 6 transaction flow, Realtor name, compact sections

This is a **small replacement-file package**, not a full GitHub upload. It is based on the earlier, long-form Version 6 transaction layout (not the Version 8 five-tab redesign). Keep your current `lib/`, `public/`, `supabase/functions/` and all unrelated files.

## Files to replace in GitHub

Open the GitHub repository `inderbains/crmsocial`, then go **inside `app/`** before uploading. Replace only:

1. `app/transactions.tsx`
2. `app/transaction-actions.tsx`
3. `app/post-firm-details.tsx`
4. `app/staged-document-upload.tsx`
5. `app/deal-admin.tsx`
6. `app/closing-panel.tsx`
7. `app/compliance-closing-panel.tsx`
8. `app/back-office-dashboard.tsx`

**Do not upload any `.tsx` file into the repository root.** Those misplaced files previously caused the Hostinger TypeScript failure. There are only eight application files in this patch.

## Supabase change (must be installed before publishing the new UI)

Back up your Supabase database and apply `supabase/056_accepted_offer_notifications_and_workflow.sql` in the **SQL Editor**, first on staging. It requires prior RealVolt migrations through Fix 055, including the firm-sale document and post-firm approval protections. Run the entire file, not one highlighted clause.

What the SQL changes:
- Marks MLS listing sheet optional; does not remove any uploaded file.
- Makes accepted-offer **document requirements optional**. Accepted Offer itself is a **status/notification event**, not a compliance-approval event.
- Sends a Back Office notification when a linked or stand-alone accepted-offer Sale is created.
- Updates the listing's displayed status to Accepted Offer even while the new sale is a Draft.
- Adds `rv056_offer_update` for agent-only subject extension (signed PDF + revised date) and offer collapse (no document); both notify Back Office **without starting compliance review**.
- On collapse, the linked listing returns to Active when otherwise eligible (or retains its appropriate expired/terminated status).
- Removes the old **accepted-offer preapproval** gate on moving to Subjects Removed. Firm sale still submits mandatory documents for administrator verification and requires saved lawyer, GST/commission and deposit details before approval.
- Adds a required **Sale Report Form on the selling side**, matching the existing firm-sale database rule and seller-side requirements.
- Does **not** relax final commission-payment or archive protections.

## Screen changes

- A small, **sticky Assigned Realtor label** is displayed throughout the opened transaction and repeated in compliance, uploads, lawyer details, CIR and archived-file views. Name is read from the linked `office_agents` profile, with a personal profile fallback for the owner.
- **Documents & uploads** and **Compliance & commission** start collapsed to reduce page length. A submitted file opened by Back Office expands compliance automatically.
- Back Office notification clicks open the transaction directly in approval/compliance context, rather than requiring a separate trip through Review Queue.
- An agent can upload **custom named documents** (“Addendum”, “Disclosure”, “Other”) without creating arbitrary mandatory compliance rows. These remain private transaction attachments, not automatically approved or mailed.
- For a Listing, Submit → Back Office review → Approve remains unchanged.
- For an Accepted Offer, there is no extra Submit button. The agent moves to Firm Sale (subjects removed/direct unconditional sale), extension or collapse.
- Firm Sale uses Submit → Back Office verification and approval, and shows lawyer/commission/deposit details in the same file.
- Your existing CIR generator, payment and banking modules are retained; they are not reinstalled or overwritten.

## Important restrictions / limitations

- **Never assume upload means verified**: only an authorized administrator verifies required documents.
- **External board/lawyer emails still require configured sender/recipient and an authorized review-and-send action**; this patch does not add unattended outbound email.
- Entering a trust deposit holder/amount does **not** prove a bank deposit has cleared. Actual trust receipts and reconciliation must be recorded and reviewed in Back Office.
- **GST on agent payout depends on the agent profile's tax registration and GST settings**, which must be correct. Do not issue a cheque based on an unverified amount. An already-issued cheque is not recalculated or reversed by this patch.
- Closed Files and read-only history remain in the existing application; this patch does not alter paid/issued cheque status or old financial records.
- This patch has **not been run against live Supabase or deployed to Hostinger**. Test in staging before using real transactions.

## Test checklist

1. Open a listing: MLS sheet is optional; upload listing contract, disclosure, IDs, and extra custom document. Submit and open the Back Office notification; verify and approve within that file.
2. Create an Accepted Offer: linked listing shows Accepted Offer and admin gets status notification; no compliance approval is demanded for the offer stage.
3. Extend subjects: attach signed extension PDF, revise date; confirm admin notification only, without a new review queue item.
4. Collapse a test offer: confirm the linked listing returns to Active (unless expired/terminated), with audit history.
5. Remove subjects or choose Direct Sold: attach required firm documents for each side, submit; fill lawyer, commission/GST and deposit holder; verify Back Office cannot approve before missing requirements/details are completed.
6. Check Assigned Realtor name in listing details, uploads, compliance, CIR and archive display.
7. Ensure CIR email attachments exclude identity files and private commission/payable documents, and do not send without authorization.
8. For a test completion, check agent split, GST, approved deductions, commission received, trust ledger and bank reconciliation. Only record a cheque as issued when actually issued; archive only when all guards pass.

**Validation:** TSX source syntax passed for the changed components. Repository tests match the source baseline: **114 passed, 33 existing failures** (not a substitute for a full Next.js build or staging integration tests).
