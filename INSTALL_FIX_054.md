# RealVolt Fix 054 — Restore the previous transaction page + keep reminder popup

**Source of restored transaction page:** `crmsocial-main (6).zip`, supplied by the owner.  This is a targeted replacement for the later five-tab transaction screen in Fix 052/053.

## What is restored
- Previous full transaction view with the original in-file **Submit to Back Office → Review → Verify required documents → Approve file / Request changes** controls.
- Only **one** Transaction Actions, DealAdmin compliance/commission section, and closing panel are instantiated in the restored source. It does not force unverified files to approved status.
- Original document uploads, status actions, CIR and lawyer sections, and commission review remain accessible the way they were in version (6).

## What is retained
- **Add reminder popup** from Fix 053 (Save, Cancel, edit, complete and delete reminders without expanding the dashboard), along with its CSS.
- **Assigned Realtor** name on an opened transaction (obtained from the central agent profile), even though this was not present in version (6).
- **Closed files** filtering through the previously added Back Office menu, so the restored transaction component can still display archived files.
- Clicking **Review file compliance** from a prepared cheque opens the original transaction and scrolls to the compliance section if the current workspace supports `initialFocus`.

## Install — source files ONLY
1. Make a copy of the current GitHub branch (or create a backup branch), then open `github.com/inderbains/crmsocial`.
2. **In the `app/` directory**, replace EXACTLY these three paths with the extracted files:
   - `app/transactions.tsx` (restored original transaction layout, with Realtor/Closed files link compatibility)
   - `app/personal-dates.tsx` (Fix 053 popup)
   - `app/SmartInbox037.module.css` (popup styling)
3. **Do not upload `.tsx` files to the repository root.** If the failed Fix 053 attempt created root-level `transactions.tsx` or `personal-dates.tsx`, delete those root copies *after* checking the correct ones exist under `app/`.
4. Commit the three updates and check the Hostinger **TypeScript** build, not just the 'Compiled successfully' line.
5. Force refresh the browser. Open an agent's submitted file in Back Office, verify the correct documents, use Approve file (or Request changes). Check that Add reminder opens as a modal.

## Supabase and release-approval note
- **No new SQL and no new Supabase Edge Function deployment** is required for this rollback. Leave the working `closing-packet` function alone.
- If Fix 052/053 database migrations were already run, **do not attempt to undo them manually**. They contain historical-compliance and cheque-issue safeguards independent of this page layout. Existing `Verified` flags and cheque approvals are not rewritten by this patch.
- Submission is **not the same as verification**. An agent can submit a file; an authorized Back Office reviewer must verify the actual PDFs and then click **Approve file**. Missing or mismatched required documents must not be automatically marked verified.
- If Fix 053's pre-cheque release SQL is installed, it still requires its separate Back Office document-release approval before issuing a commission cheque. This patch restores the prior transaction-review screen, not the security rules.

## Validation and limits
- Confirm the three source files parse as TypeScript/TSX and verify each appears at the expected path.
- This restores the user's preferred transaction page but does **not** represent a live deployment or a full Next.js/Hostinger build. Screenshot-only duplications should be checked on the fresh deploy; they can also reflect old/live code mismatches.
