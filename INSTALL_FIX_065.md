# RealVolt Fix 065 — Agent-submitted documents stay linked, Back Office reviews only

## Purpose
When a Realtor uploads a document into a category, the Back Office review must show the **same linked document** under the same category. The reviewer may open the file and mark it approved, or request changes with a note. Back Office must not select an arbitrary different attachment or replace an agent-stage upload.

## GitHub — only 3 files, in the `app/` folder
- `app/direct-file-review.tsx` — removes the "Select attached document" dropdown and manual relinking, displays the submitted filename, enables Open / Approve document / Approve file / Request changes, highlights obvious incorrect file types.
- `app/staged-document-upload.tsx` — disables Back Office uploads/replacements for listing, offer and subject-removal stages. Keeps Back Office completion-stage uploads available after completion and approval.
- `app/transactions.tsx` — hides the Remove file action from Back Office and keeps it for the original agent only while the file is editable.

Do **not** upload `.tsx` files at the GitHub repository root. Replace these files inside `app/` only. Do not upload the complete project.

## Install and test
1. Back up your repository or make a branch. Deploy to staging first.
2. In GitHub `app/`, upload the three files listed above. Commit once.
3. No new SQL migration or Supabase Edge Function deployment is included in this patch.
4. On staging, log in as agent and upload one correctly named file under each required category. Submit the file.
5. Log in as Back Office admin; click the submission notification and open direct review. Each category should show the **same exact uploaded filename** and Open + Approve document (no dropdown, no replace). Review the PDFs individually and approve only correct files.
6. Test with a wrong document: leave approval unchecked, type a reason, click Request changes. Agent should replace only their incorrect item; it must return for review and retain audit history.
7. Test Back Office completion after legal closing to ensure the separate completion-stage upload remains usable.

## Safety notes
- This is an **interface-level restriction**, not a new database policy. Existing database permissions and admin RPCs are not changed. Supabase RLS/RPCs should also be reviewed before relying on this as a hard security boundary.
- Existing bad links/verified flags are **not automatically rewritten**. Back Office must correct historical incorrect links by requesting replacement or following an audited data-repair process; do not approve an unrelated file.
- The heuristic detects a few obviously unrelated filenames, but **a filename is not proof of document contents**. Actual document review is still mandatory.
- A full production build and live end-to-end test have not been performed in this environment.
