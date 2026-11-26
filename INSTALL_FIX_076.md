# RealVolt Fix 076 — Completed transactions for Agents; Closed Files for Back Office

Base: Fix 075 interface with the existing Version 6-style transaction workflow.

## Only 3 GitHub files to replace

Upload these files **inside the existing `app/` folder** of `inderbains/crmsocial` (NOT the repository root):

- `app/personal-dates.tsx`
- `app/transactions.tsx`
- `app/realvolt-workspace.tsx`

Do not upload the ZIP itself to GitHub. Commit once, let Hostinger build, then hard-refresh RealVolt (Ctrl+Shift+R).

## What changed

- **Agent dashboard → Completed:** Includes sale records with `rv_stage=Completed` or `Archived` as well as previously completed personal reminders. Clicking an archived sale opens the same read-only transaction and its retained documents.
- **Agent → Transactions → All transactions / Sales:** Completed and archived sale files remain visible and openable. Archived files are labeled `Completed · Archived` and are read-only. They are no longer removed from everyday agent lists.
- **Agent sidebar:** Removed the additional `Closed Files` entry. `Archive` is retained for its previous listing/termination behavior.
- **Back Office → Transactions & Review → Closed Files:** Kept as the dedicated archive folder for brokerage administrators. Its existing document access and brokerage RLS permissions remain in effect.
- **Sold border:** Red outline retained for Sold, Completed, and Archived sales. No filled status cards.
- **Activity:** Still limited to offer collapse, listing termination, and subject extension events. Completed sales go under Completed, not Activity.

## Verification

1. Agent: open My Workspace → Completed. Archived sale should be present.
2. Click its entry: file opens read-only with available sale and linked listing documents.
3. Agent: Transactions → All transactions and Sales. Archived sale is present with a Completed label and red border.
4. Agent: confirm there is **no separate Closed Files menu**.
5. Back Office: Transactions & Review → Closed Files. Archived sale is still there, with access controlled by brokerage permissions.
6. Verify existing agent submission, admin approval, CIR and cheque functions remain unchanged.

## Installation and limitations

**No Supabase SQL or Edge Function deployment is required** by this patch, because closed files are already stored as archived `deal_files` and their documents remain in Supabase Storage.

The three TSX files passed TypeScript **syntax parsing** and targeted source assertions. Full Next.js TypeScript compilation and logged-in acceptance testing must still be done on staging/Hostinger. If a file still cannot be read, verify brokerage RLS and document-storage permissions; this patch does not grant access to otherwise unauthorized records.
