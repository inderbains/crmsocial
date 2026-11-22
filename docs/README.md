# RealVolt Fix 039 — Restore Original Back Office Cards

This correction follows user screenshots. It **does not redesign or remove** the original big orange-icon Back Office application cards. The old replacement text buttons from 038 are removed. The large standalone Office Transaction Updates block is removed from Back Office Dashboard route; the same real data appears in a single compact tabbed area. Accounting / Reporting / Compliance each get their own card but open the three views of the existing `OfficeFinancialCompliance` page, so no fake separate accounting engine is introduced.

## Included

- `app/back-office-dashboard.tsx` — original module groups and card styling, compact 037 inbox, adds Accounting / Reporting / Compliance cards.
- `app/office-financial-compliance.tsx` — keeps existing trust accounting/reporting/compliance views, opens the requested tab.
- Other Fix 038 dependencies bundled for installations that need them.
- `scripts/apply-realvolt-039.mjs` — guarded installer that checks integration points before changing files and fixes the duplicate legacy office notices.

## Preflight / installation

1. Back up your latest GitHub repository. **Do not drag the ZIP into the GitHub root.**
2. Extract this ZIP outside your repository and run `node /path/to/RealVolt039/scripts/apply-realvolt-039.mjs /path/to/crmsocial` on your actual current source copy.
3. Review the diff, then run `npm run build` and test both dashboards and all 3 new finance entry points. Deploy only after that succeeds.
4. If the script reports a different parent component layout, stop and provide your latest source ZIP for a manual merge — do not force replace.

**No new Supabase SQL is needed** if migrations 034/035 and Fix 038 financial tables are present. Actual financial reports rely on valid live records and Supabase RLS. This package does not change finance authorizations, payroll accounting or lawyer email configuration.

## What must remain

The original Review queue, Changes requested, Approved, Agents & profiles, New agent setup, Plans & monthly fees, Cheque printing, Agent payments, Payroll & salaries, EFT payments, Trust & bank, Bank reconciliation, Reports, Audit & controls, Brokerage Control, Brokerage settings, Office DDF & Listings, Office Meta Accounts, Office Lead Routing, Office Marketing Dashboard cards **all remain**. The three additional cards are Accounting / Reporting / Compliance.

## Safety

The script refuses to change a repository whose original global card styling or Back Office dashboard integration is missing. Run a full Next.js production build before deploying. The available reference archive is older than your GitHub live branch, so a successful production build of your current repository has not been verified here.
