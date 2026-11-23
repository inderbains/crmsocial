# RealVolt Fix 046 — Named compliance document uploads

Prepared using the user's supplied `crmsocial-main (4).zip` and Fix 044 reference. This release is **not yet deployed**, and its SQL has not been executed against your Supabase project.

## What changes

On an agent's saved Listing or Sale transaction, the old single "Choose Files" field becomes named upload slots:

| New listing | Seller-side accepted offer | Buyer-side accepted offer | Subjects removed / firm sale | Back Office closing |
|---|---|---|---|---|
| Multiple Listing Contract (signed) | Contract of Purchase and Sale (CPS) | CPS | Signed subject removal | Lawyer completion letter |
| MLS listing sheet/details | Commission disclosure | Disclosure of Services / Representation | Seller side: Trade record sheet | Brokerage completion confirmation PDF |
| Listing disclosure | Optional contract addendums (multiple) | Buyer FINTRAC ID | Seller side: Sale report form | Commission Instruction Report (CIR) |
| FINTRAC ID | | Optional contract addendums (multiple) | Buyer side: Deposit cheque copy / receipt | Internal commission payable PDF |
| Optional listing addendums (multiple) | | | Subject extension/addendums (multiple) | |

The checklist comes from editable `rv_compliance_templates` (SQL 044); brokers can change the form list using the existing Compliance tools. The exact documents the managing broker requires may vary by transaction. The displayed titles are friendly aliases; the original database labels remain unchanged.

For an Accepted Offer, the subject-removal section is collapsed until needed; it can be expanded to upload the removal PDF before clicking "Remove subjects / mark firm sold." After status Sold it expands automatically. Each slot shows **Not uploaded**, **Uploaded—awaiting verification**, or **Verified by Back Office**. Agents can replace an *unverified* file; the original attachment remains in the audit history. Optional addendum slots support multiple files. The original attached-document list and Remove file action remain intact.

## Installation sequence

1. Back up GitHub and Supabase; first use a staging project. **Do not upload this entire ZIP to the GitHub repository root.**
2. In Supabase SQL Editor, check whether Fix 044 is installed:

```sql
select to_regclass('public.rv_compliance_templates') is not null as compliance_044_installed;
```

3. If false, run the included **`supabase/044_staged_compliance_archive.sql`** first, exactly once in a fresh SQL Editor query. If true, **do not rerun 044**. Check against your current live schema before applying migration to production.
4. Run **`supabase/046_named_compliance_uploads.sql`** after 044. It allows agents to upload later sale/subject-removal documents to their own open files, authorized Back Office staff to upload closing forms, and includes a server-validated RPC to link each upload to its correct form category. No finance rules are changed.
5. Download your **current** GitHub `crmsocial` project. Extract Fix 046 separately. From a terminal (Node.js 22+):

```bash
node /path/to/fix046/scripts/apply-fix-046.mjs /path/to/crmsocial --dry-run
node /path/to/fix046/scripts/apply-fix-046.mjs /path/to/crmsocial
cd /path/to/crmsocial
npm install
npm run build
```

The installer only edits `app/transactions.tsx` using anchor checks and adds two new files under `app/`. It creates `.txt` backups in `rv046-backup`. **Do not commit the backup folder.** If the code differs from the archived version, the installer will stop instead of blindly replacing your latest work.
6. Commit only the changed `app/transactions.tsx`, new `app/staged-document-upload.tsx`, new `app/staged-document-upload.module.css` and your versioned SQL file. Check the paths: the `.tsx` files belong inside **`app/`**, not the GitHub root.
7. Deploy through Hostinger and test. **Before deploying, ensure there is no accidental root-level `personal-dates.tsx` or other misplaced TSX file:** your recent Hostinger build logs showed this separate error. This patch does not alter the home dashboard.

### If you only use GitHub's website

Do not upload a previous `transactions.tsx` over a newer version. Add these **two new files** inside your GitHub **`app/`** directory:
- `app/staged-document-upload.tsx`
- `app/staged-document-upload.module.css`

Then edit the existing `app/transactions.tsx`:
- Import `StagedDocumentUpload` from `./staged-document-upload` beside `TransactionActions`.
- Add `const [requiredReady,setRequiredReady]=useState(false)` near `documentRevision` state.
- Reset it when `selected` changes (`useEffect(()=>{setRequiredReady(false)},[selected]);`).
- Put `<StagedDocumentUpload key={active.id} deal={active} docs={docs} office={backOffice} displayStatus={statusFor(active)} notify={notify} onSaved={refreshFile} onReadyChange={setRequiredReady}/>` immediately after the "Attached documents" heading.
- Remove **only** the old generic `<input id="deal-upload" ...>` field and its label wrapper. Keep the list of already attached documents and its Open/Remove actions.
- For `Submit to back office`, change `disabled={busy||!docs.length}` to `disabled={busy||!docs.length||!requiredReady}`.
- Do not touch Back Office layout, the Transaction Actions component, Agent Profile, commission calculations or bank reconciliation.

## Tests after deployment

- [ ] New listing shows MLS listing details, signed listing contract, disclosure and FINTRAC ID as separate upload slots; submit stays disabled until all required slots contain a document.
- [ ] Buyer-side sale shows CPS, Disclosure of Services, FINTRAC buyer ID and optional addendums.
- [ ] Seller-side sale shows CPS, commission disclosure and optional addendums.
- [ ] Before subject removal, expand the firm-sale stage and upload signed removal and other stage forms. Select the signed PDF in the transaction action and mark firm sale.
- [ ] Under Back Office, verify the uploaded documents from the compliance checklist. Agent cannot verify their own document.
- [ ] Upload two different addendums and confirm both survive in the transaction's attached document list and closing manifest.
- [ ] Confirm document replacement does not erase original signed versions or transaction audit history.
- [ ] Confirm an agent in a different brokerage cannot access the file or change its compliance labels.
- [ ] Confirm the established closing manifest and CIR/internal commission privacy protections still operate (requires Fix 044).

**Security:** FINTRAC/identity records and the internal commission statement must **never be attached to lawyer email packages**. Keep actual email delivery disabled until your closing-packet Edge Function from Fix 044 is deployed and tested. Broker-configured form templates are not a substitute for managing broker compliance review.

## Verification status

- Five focused automated/static tests passed against the uploaded project and the Fix 044 merge.
- TypeScript syntax was checked for the two TSX integration targets.
- Full Next.js typechecking/build, Supabase execution, real bank postings and live end-to-end tests are not verified in this environment.
