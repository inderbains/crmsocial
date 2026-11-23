# RealVolt Fix 047 — Three sale outcomes, document uploads and in-file Back Office review

## What changed

- **Three conditional-sale outcomes:** Subjects removed / firm sold; Subject extension; Sale collapsed / close file. A signed PDF is attached directly in the action form (or selected from existing uploaded PDFs). The action becomes official only after **Confirm** succeeds.
- **Collapsed sale:** its `rv_stage` becomes `Collapsed`, it is removed from active sales, agents cannot continue uploading or changing the deal, it does not count as a firm sale. Back Office can acknowledge the closed record from its notification, with preserved attachment history. The status change is not a deletion.
- **Addendums:** existing listing, accepted-offer and subject/firm-stage addendum categories support repeated multi-file uploads (PDF, JPG, PNG, DOC, DOCX, XLS, XLSX, TXT). SQL 047 adds an optional closing addendum too. Files remain private; 20 MB per file.
- **Required compliance documents:** Title Search and Property Disclosure Statement (PDS) added to the sale's subject/firm stage. A Back Office reviewer may waive a genuinely not-applicable form with an audit reason.
- **After subject removal:** lawyer contacts, commissions, GST and deposit instructions are entered on the **Sold / Firm** file, not on the new or accepted-offer form. A new secured Supabase RPC allows agent and assigned reviewer to save them; legal completion is blocked until both lawyers and the post-firm details are confirmed. This changes an existing SQL 034/035 prerequisite, so **SQL 047 is required**.
- **Back Office notification:** opening an agent's submitted file shows **Approve file** and **Request changes** near the top, and a button to jump to document verification. Required documents must be verified or formally waived before ordinary approval. The reviewer does not need to return to the Review Queue. For a collapsed file the reviewer can acknowledge closure; missing documents are still visible in the audit checklist.

## Install: two steps, in this exact order

1. **Back up your live Supabase database**, preferably test in a staging copy first. SQL 006, 034, 035, 044 and 046 must already be installed. Your SQL 044 and 046 were reported successful; **do not rerun them**.
2. Open **Supabase > SQL Editor > New query**. Paste the **entire** file `supabase/047_firm_sale_workflow.sql`, including the `DO $rv047_migration$ BEGIN ... END $rv047_migration$;` block. Click Run. It is packaged as one SQL statement on one physical code line, to avoid prior partial-selection errors. Confirm **Success** before editing GitHub. The migration adds one boolean column, the secured post-firm RPC, new compliance templates, and updates only the existing transaction lifecycle function. No existing deal tables are dropped.
3. In GitHub open the `app/` folder **first**, then upload and replace these EXACT four files:

   - `app/transactions.tsx` — review panel, after-firm slot, correct edit sequence.
   - `app/transaction-actions.tsx` — three outcomes with immediate signed-PDF upload.
   - `app/staged-document-upload.tsx` — Title Search / PDS / more addendums.
   - `app/post-firm-details.tsx` — **new** post-firm lawyer/commission form.

   **Do not upload `.tsx` files into the repository root** or paste partial code. Do not upload the ZIP as source code.
4. Commit. Wait for Hostinger's automatic build. Send the complete build log if it fails. Verify the controls in an agent account and an assigned Back Office admin account. If your GitHub files were updated after the supplied `crmsocial-main (4)(1).zip` archive, review the diffs before replacing them.

## Test in app

- Agent: open an Approved accepted-offer sale, select **Subject extension**, choose new date, upload a signed PDF, confirm; file goes back for admin review.
- Agent: open a conditional sale, choose **Subjects removed / firm sold**, attach signed PDF and firm date; the **After subjects removed — lawyers & commission** form appears. Save both lawyers, commission and deposit info. The signed subject-removal requirement is linked to the uploaded PDF.
- Agent: collapse an Approved conditional sale using signed collapse/release PDF. It becomes **Collapsed**, stays in audit history, is not an active sale.
- Agent: upload multiple addendums in offer, subject/firm, listing and (Back Office) closing phases.
- Back Office: open the agent's notification to enter the specific file. Verify required docs, then approve or request changes in the same file. For collapsed sale, acknowledge closure.
- Legal completion still requires an approved firm sale, confirmed lawyer/commission details, and its signed lawyer completion PDF. Commission payment still follows separate verified receipt and payout controls.

## Verify SQL 047

Run `VERIFY_FIX_047.sql` in Supabase after the migration. Expected: three `true` columns for `post_firm_column`, `post_firm_rpc` and `title_and_pds_templates`.

## Validation and limitation

Six focused code/structure tests passed and all four TSX files passed the TypeScript TSX parser. **The full Next.js type-check/build and SQL execution against your live Supabase were not performed here.** npm dependency installation was unavailable in this environment. SQL 047 updates the 035 version of `rv_tx_action`; check that the active database hasn't received newer custom changes to that function before running on production.

**Sensitive documents:** identity verification/FINTRAC materials stay in the private transaction storage bucket. Confirm actual RLS policies and signed-URL restrictions before using real client records. Uploaded PDF filenames are not proof of a valid signature; Back Office must verify the documents.
