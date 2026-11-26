# RealVolt Fix 075 — Closed Files, Sold borders, reminder position

**Base:** Current RealVolt transaction source incorporating Fix 073 and cheque-release SQL repair 074. This update changes only interface/navigation code and **does not replace existing accounting, CIR or cheque logic.**

## Files to upload to GitHub

Open `github.com/inderbains/crmsocial` → `app/`, then upload **only these four files** from this ZIP's `app/` folder:

1. `transactions.tsx`
2. `realvolt-workspace.tsx`
3. `SmartInbox037.tsx`
4. `SmartInbox037.module.css`

Commit once. **Do not upload them to the root folder.** No Supabase SQL, Edge Function, or additional cloud-storage service is required for this UI change.

## What changed

- **Agent:** Transactions → **Closed Files** shows only archived sales belonging to that logged-in agent.
- **Brokerage Admin:** Back Office → Transactions & Review → **Closed Files** shows archived brokerage sales, subject to existing brokerage and reviewer permissions. There is an agent filter and address search.
- **Documents:** Opening a closed sale shows its current `deal_documents` from Supabase Storage in a read-only expandable group; a separate expandable section displays documents belonging to its linked original listing when the user has permission. Open files via short-lived signed URLs.
- **Closed files are locked:** This view does not allow modifying transaction data, issuing payments or changing uploads. Original documents stay in their existing bucket; nothing is moved or duplicated.
- **Status borders only:** Active Listing = green; Accepted Offer = orange; Sold/Completed/Archived sale = red. No filled transaction status cards. Closed sales are shown as “Sold · Closed.” The Sold dashboard tab also uses red outlines.
- **Reminder:** `+ Add reminder` is positioned slightly higher. The existing modal and saved-reminder workflow are unchanged.

## Check after deployment

1. Agent: Transactions → Closed Files. Open an archived sale and check all listed sale documents can be opened.
2. If this sale was created from a listing, expand **Original listing documents** to view permitted original listing attachments.
3. Back Office: Transactions & Review → Closed Files. Open the same file as an authorized admin and confirm docs remain accessible.
4. Confirm there is no Edit/Remove/Payment action on an archived file. Live files must retain existing workflows.
5. Confirm a sold/closed file has a **red border**, accepted offer orange, active listing green; backgrounds remain neutral.
6. Confirm the dashboard reminder button is slightly higher and still opens a popup.

## Known limitations / safeguards

- This is a **filtered view of already-archived records** (`deal_files.rv_stage = 'Archived'`), not a new storage migration. Existing RLS and Storage policies control document access.
- If a document has already been deliberately removed from the live `deal_documents` list, it remains in audit history rather than reappearing in the normal Closed Files attachments. This is intentional.
- The existing Supabase storage bucket continues to incur normal usage charges; monitor usage as brokerages grow. No new cloud provider is needed now.
- TypeScript TSX parsing passed for the modified components. The available repository test suite has **110 passes and 39 existing failures**, unchanged from the base. A complete hosted Next.js build and signed-in RLS checks must be performed after staging deployment.
