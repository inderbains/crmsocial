# RealVolt Fix 044 — Staged Compliance, Final PDFs & Closed File Folders

**Prepared from the user-uploaded `crmsocial-main (4).zip` project**, not the unverified newest live GitHub commit. This is a code patch, not a live deployment. Do not overwrite newer GitHub versions of existing files blindly.

## 1. Contents

- `supabase/044_staged_compliance_archive.sql`: brokerage form templates, stage-based checklists, missing-document and archive guards, audit-ready closed-folder manifest.
- `app/deal-admin.tsx`: groups document requirements by Listing, Accepted Offer, Firm Sale, Completion; supports document linking and verification, a reasoned "N/A", and notifying the agent.
- `app/brokerage-compliance-rules.tsx`: brokerage-level template editor; new required forms can be added for future and open files.
- `app/back-office.tsx`: connects the previously unlinked **Financial & compliance** route to the existing oversight screen and the new form-template editor.
- `app/transactions.tsx`, `app/transaction-actions.tsx`: shows the closing folder, calls the guarded archive action.
- `app/closing-panel.tsx`: allows saving the existing CIR preview as an internal file PDF; **does not automatically email lawyers**.
- `app/compliance-closing-panel.tsx`: generates and saves the brokerage completion confirmation and internal commission-payable PDFs after a payout is marked Paid; renders a read-only file folder after archive.
- `lib/transaction-document-save.ts`: authenticated append-only upload to the existing private transaction bucket and checklist linkage.
- `supabase/functions/closing-packet/index.ts`: explicitly blocks FINTRAC/identity and internal commission attachments from lawyer emails. **Redeploy this function on Supabase after merge; GitHub alone does not deploy it.**
- `scripts/apply-fix-044.mjs`: careful anchored merge into a current repo, with `.txt` backups; aborts if expected source is different.
- `tests/transaction-compliance-044.test.mjs`: focused static tests of the new code and safeguards.

## 2. Staged documents

| Stage | Seller-side listing/sale | Buyer-side direct sale |
|---|---|---|
| New listing | Signed listing contract, MLS listing sheet/details, disclosure, FINTRAC identity verification; optional addendum | Not applicable |
| Accepted offer | CPS, commission disclosure; optional addendum | CPS, disclosure of services/representation, FINTRAC buyer ID verification; optional addendum |
| Subjects removed (firm) | Signed subject removal/unconditional contract, trade record sheet, sale report; optional extension/addendum | Signed subject removal/unconditional contract, deposit cheque or deposit receipt; optional extension/addendum |
| Legal completion & close | Lawyer completion letter, brokerage completion confirmation PDF, CIR PDF and **internal** commission payable PDF | Same final requirements |

The company can add/change requirements under **Back Office → Compliance → Manage form requirements**. Existing files keep their recorded history; disabling a template affects new applications. Back Office can mark a genuinely inapplicable requirement N/A **with a reason**. This is your requested initial checklist, **not a legal assertion that these are all forms required in BC**. The managing broker must verify final requirements.

## 3. Safe installation order

1. **Back up** the current GitHub branch and Supabase production database. Test in a *separate staging project* before production.
2. Run **the complete** `supabase/044_staged_compliance_archive.sql` in the staging Supabase SQL Editor. It requires prior SQL 006, 034 and 035. Do not re-run earlier migrations. **Run 044 once**; it changes existing checklists and adds tables/triggers.
3. Download/clone the **current** GitHub `inderbains/crmsocial` project. Extract this release *outside* the repo. From a terminal:

   ```bash
   node /path/to/RealVolt_044/scripts/apply-fix-044.mjs /path/to/crmsocial --dry-run
   node /path/to/RealVolt_044/scripts/apply-fix-044.mjs /path/to/crmsocial
   cd /path/to/crmsocial
   npm install
   npm run build
   ```

   On Windows, quote the paths with spaces. The installer creates `rv044-original-backups/` with `.txt` backups of modified source files. It does **not** modify Supabase or deploy to GitHub.
4. Commit the changes to GitHub only after the staging build succeeds. Deploy the updated `supabase/functions/closing-packet/index.ts` and the existing `_shared` function files to Supabase Edge Functions separately. Check email sender settings before enabling sends.
5. Test with a fresh listing, accepted-offer seller file, and direct buyer sale. Verify each checklist stage and test incomplete submissions, document-link review, signed extension, firm status, CIR preview/save, completion, payout, PDFs and archive. Also confirm data isolation from another brokerage.

### If you upload via the GitHub website only

New files to create: `app/compliance-closing-panel.tsx`, `app/brokerage-compliance-rules.tsx`, `lib/transaction-document-save.ts`, and `supabase/044_staged_compliance_archive.sql`.

Existing files that **must be merged**, not blindly overwritten if the latest GitHub differs from `crmsocial-main (4).zip`: `app/transactions.tsx`, `app/deal-admin.tsx`, `app/transaction-actions.tsx`, `app/closing-panel.tsx`, `app/back-office.tsx`, `supabase/functions/closing-packet/index.ts`. The package includes reference versions of these files, but manual upload over newer code could remove fixes 040–043.

## 4. After completion

In Back Office, a sale stays **Sold** after subjects are removed. After legal completion the administrator uploads the lawyer letter and confirms completion, verifies cleared commission receipt and makes the internal agent split/payout. When that payout is **Paid**, use **Generate and attach closing PDFs**. Generate CIR from **CIR and letter to complete → Preview → Save CIR PDF to transaction file** (or upload an existing final CIR). Link and verify all required documents, then select **Close / archive file**.

The archive records one **read-only manifest** of all documents, organized by stage, under the existing private `transaction-files` path of the deal. It does **not** physically move files, create a downloadable ZIP, erase historical versions, or transmit files to lawyers. This deliberate retention protects the audit trail. Bank reconciliation remains a separate monthly financial workflow; a closed transaction is not automatically a reconciled bank statement.

## 5. Limitations and testing

- 11 new **static** tests pass, and the changed files pass TSX/TypeScript syntax checks. The anchored installer was tested against the actual uploaded source and again for idempotence.
- A full `npm run build` could **not** be performed here because the dependency cache is unavailable offline. Neither the migration nor external Edge Functions have been exercised against live Supabase.
- Your earlier 034/035 code and finance controls still need real end-to-end staging tests; especially trust entries, reconciliation and segregation of duties. Do not enable automatic financial payouts from this compliance screen.
- Existing archived files are not automatically converted into new archive manifests; the new manifest is created when a file is closed after applying 044.
- **Do not attach internal commission statements or FINTRAC ID files to lawyer emails.** The updated server-side exclusion applies after re-deployment of `closing-packet`.
