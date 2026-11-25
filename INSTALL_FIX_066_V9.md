# RealVolt Fix 066 — Version 9 draft discard (minimal patch)

**Based on your uploaded `crmsocial-main (9).zip` exactly.** This is NOT a full project replacement. All existing Version 9 transaction, Back Office, compliance, and closing UI remains as it was.

## What changed
- `app/transactions.tsx`: adds a `Delete draft` control next to Edit Details for the owning agent while the transaction is an unsubmitted Draft. Confirmation requires typing `DELETE`.
- `supabase/066_agent_draft_discard.sql`: adds a protected soft-delete RPC, an audit timestamp, and guards against deleting submitted/reviewed, completed, linked, notified, or financially active deals. Records and uploaded attachments remain retained for audit.

## Install (SQL first)
1. **Back up the Supabase database and try this on a staging project first.**
2. Supabase Dashboard > SQL Editor: open `supabase/066_agent_draft_discard.sql`, copy **all** of it and run it once. Do NOT upload the SQL file to GitHub to execute it; it must be run in Supabase.
3. GitHub `inderbains/crmsocial` > **`app/` folder** > Add file > Upload files. Upload **only** `app/transactions.tsx` from this ZIP. This replaces `app/transactions.tsx` in that folder. Do **not** put it at GitHub repository root.
4. Commit once. After Hostinger finishes the deployment, refresh RealVolt.
5. Create a new independent Listing or Sale Draft in a test account (do not use a real client file). Verify `Delete draft` appears beside `Edit details`. Click Cancel or type anything other than `DELETE` to keep it. Type `DELETE` to discard, and confirm it disappears from the transaction list.
6. Verify **no** Delete draft button appears on Submitted/Approved/Archived transactions. A sale already linked to a listing, a draft with a Back Office notification, or a file with payout or cheque records must be rejected if deletion is attempted.
7. Verify Back Office notification -> review -> Approve/Request Changes and normal agent uploads still work.

## Important
- This performs a **soft discard**, not a permanent erasure. The database row and previously uploaded documents remain stored for compliance/audit.
- Only the `Transactions` screen query excludes discarded drafts; other reports using the raw `deal_files` table may need an additional filter in a later release.
- **No other application files should be replaced.**
- TypeScript TSX syntax validation passed. In 18 targeted local tests, the patched and original Version 9 each passed 15 and failed the same 3 older tests. A complete Next.js production build or real Supabase integration test was not performed. This is not yet installed on the live site.
