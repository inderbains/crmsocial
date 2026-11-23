# RealVolt Fix 048 — Select Action First, Upload Documents Inside Action

## Requested behavior

The **Transaction actions** dropdown controls the form:

- **Remove subjects / mark firm sold:** actual firm date, Signed Subject Removal (signed PDF), Title Search, Property Disclosure Statement (PDS), Deposit Cheque Copy / Receipt, plus optional *multiple* additional addendums (PDF, image, Word, Excel or text). Clicking **Submit firm sale & documents** uploads the selected files, links them to the correct compliance categories and then records the firm-sale status. Documents appear in Attached Documents and the stage compliance section **after submission**. The firm-stage checklist is **not displayed beforehand**.
- **Extend subjects:** only the revised subject date and signed extension PDF, then confirm. File remains conditional and returns for Back Office review.
- **Offer collapsed:** only the **Confirm collapsed / close file** button, with a confirmation dialog. **No document, date or upload is required.** The file is retained for history and excluded from active/firm sales.

Back Office document verification and approval remain in the same transaction page. After firm status, agent enters lawyers, commission and deposit through Fix 047's post-firm details form.

## Prerequisites

**SQL 047 and its application patch MUST already be installed.** Previous SQL 044 and 046 should also have succeeded. Confirm before proceeding:

```sql
select to_regprocedure('public.rv_save_post_firm_details(uuid,uuid,uuid,numeric,numeric,numeric,numeric,text,text)') is not null as sql_047_rpc_present,
       to_regclass('public.rv_compliance_templates') is not null as sql_044_present,
       to_regprocedure('public.rv_link_uploaded_compliance_doc(uuid,uuid,text,boolean)') is not null as sql_046_present;
```

All should return true.

## Install

1. Back up Supabase, preferably test on a staging copy first. Run the **entire** `supabase/048_action_uploads_and_no_document_collapse.sql` in a **new** Supabase SQL Editor query. It contains a complete single-line `DO` statement; never run a highlighted fragment. Confirm Success. SQL 048 redefines the transaction-action function to permit document-free collapse, adds a required deposit cheque category for seller-side sales, and requires all four documents when recording a firm sale. It does NOT drop any transaction tables or touch stored files.
2. Open GitHub `crmsocial` **→ `app/`** folder and replace **ONLY** these two files:
   - `app/transaction-actions.tsx`
   - `app/staged-document-upload.tsx`
   Keep `app/transactions.tsx` and `app/post-firm-details.tsx` from Fix 047 unchanged.
3. Commit. Hostinger rebuilds automatically. Do not upload the ZIP into GitHub, do not replace files in the repository root, and do not paste only parts of TSX files.
4. In an **accepted offer** open Transaction actions and test firm (using test documents), extension, and collapse on separate test deals. Test Back Office approval and audit history from the notification link.

**For previous firm sales:** Existing Title Search/PDS/Trade Record/Sale Report requirements stay in the Back Office compliance system. This patch does not silently remove older compliance obligations. The new firm action collects the four documents specified; any other brokerage-required compliance files remain reviewable afterward.

## Validation

6 focused node tests passed. Both modified TSX files parsed with no syntax diagnostics using the TypeScript TSX parser. **Full Next.js build and live Supabase execution have not been performed.** Stop on database errors; do not try random migrations or replace unrelated files.

## File upload security

Documents remain in the existing private `transaction-files` bucket; verify bucket permissions and row-level security with test users. FINTRAC documents must never be included in conveyancing emails. The backend checks that the four named firm documents were linked before accepting the firm-sale action.
