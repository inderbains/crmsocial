# RealVolt 038 — Consolidated dashboard + financial operations upgrade

**Updated after the 034/035 transaction testing and the 036/037 dashboard iterations.**

This is a **merge package**, not a complete replacement of the latest live GitHub repository. It was tested against the latest source archives available in this chat and both previous 036→037 installation sequences. We cannot access the current GitHub `main` source directly; the installer is deliberately guarded against overwriting unknown newer edits.

## What this fixes now

**Agent dashboard:** same compact pale-green box; personal dates on the left; Reminders / Upcoming / Activity / Clients on the right, with unread/count badges, empty panel by default, and clickable CRM/transaction records. Up to 3 items per selected tab initially.

**Back Office dashboard:** one compact Office Updates panel; New Files / Review / Upcoming / Activity; brokerage-scoped queries, deep links to exact transaction, counts and background refresh. Removes the redundant full-size Office Transaction Updates section. Other modules remain accessible below.

**Accounting / Reporting / Compliance:** dedicated Back Office `Financial & compliance` route, including read-only trust book balances, deal liability comparisons, reconciling exceptions, earned/completed commission receivables (distinct from payouts), authorized vs paid agent payouts, firm-sale monthly sales/volume/expected commission, indicative GST, CSV registers, missing documents, lawyer completion-letter checks and audit summaries. Financial posting and payment authorization stay in the existing Trust & bank / Agent payments / Bank reconciliation modules.

**Transaction actions:** only one action selector should be rendered per transaction detail. The installation script checks the current transactions source for repeated `<TransactionActions>` markup. If it finds duplicates, it stops rather than deleting unpredictable live code. A separate current-source repair would then be needed.

**Previous Hostinger build errors:** Back Office `userId` is integrated; example folders (`reference-only`, `edge-editor`, old backup folders) are excluded from Next.js type checking. These example folders are not packaged as active source.

## How to install safely

1. Back up the live Supabase database and download a **fresh** ZIP of the current `github.com/inderbains/crmsocial` repository (branch `main`). Work on this fresh local copy, not a November 20 source snapshot.
2. Extract this package **outside** the repository.
3. In a terminal with Node.js 22+, run:

   ```bash
   node /path/to/RealVolt_038/scripts/apply-realvolt-038.mjs /path/to/crmsocial
   ```

   On Windows, use quoted full paths, e.g. `node "C:\\Downloads\\RealVolt_038\\scripts\\apply-realvolt-038.mjs" "C:\\Downloads\\crmsocial-main"`.
4. The installer preflights the parent integration points **before writing**; it makes backups in the operating-system temp directory, outside the GitHub project. If it stops because your live source differs, **do not force the changes**. Provide a ZIP of your latest GitHub repository for a source-specific merge.
5. In the project folder run:

   ```bash
   npm install
   node --test tests/office-insights-038.test.mjs
   npm run build
   ```

6. Review the changed files, commit and deploy first to a staging environment. Confirm the actual Hostinger build succeeds before going live.
7. Test using an **agent** and a different **brokerage admin**, and test two isolated brokerages before enrolling paying customers.

### Do not upload this entire ZIP into GitHub

Only `github-files/app/*`, `github-files/lib/*`, and `github-files/tests/*` belong in the corresponding project folders **after** the parent merges are applied. Uploading those components alone is insufficient for the new Financial & compliance route and CRM deep links. The merge script also changes `app/back-office.tsx`, `app/realvolt-workspace.tsx`, `app/crm.tsx` and `tsconfig.json` safely.

`supabase-source/` contains Edge Function code **for separate Supabase deployment**, not a new database migration and not a Next.js upload. Existing 034 + 035 database migrations are assumed installed. **Do not re-run them.** The `closing-packet` function must be deployed with its `_shared` modules through the Supabase CLI; until then, PDF previews and email delivery are not verified.

## Scope and limitations

- This is a code update to **existing** 034/035 transaction workflows, not a replacement of all transaction SQL or accounting controls. Listing → accepted offer → signed subject removal → firm sold → legal completion → commission receipt → payout remains provided by the prior database and application code.
- Firm sales count at `rv_firm_date` **once**, not on completion. Payouts still require legal completion, verified funds and the established approval process.
- Agent split, unpaid fees and GST on payouts use the **existing** functions and agent compensation plans. This patch does not authorize or automatically issue bank payments.
- Summary balances are not bank-provided balances or an official regulatory accounting return. Managing-broker review and independent verification are still required.
- No new Supabase SQL 038 is necessary. Edge Function deployment is separate.
- We could run twelve focused unit/integration-source tests and TypeScript syntax transpilation, but **could not run a full `npm run build` against the inaccessible live GitHub commit**. Run it on the live checkout as above.

See `docs/FEATURE_MATRIX.md` and `docs/TEST_CHECKLIST.md` for exactly what is included versus what still requires live verification.
