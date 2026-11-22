# RealVolt Fix 039 — Restore original Back Office cards

**What this fixes:** Fix 038 replaced your full-size orange-icon Back Office module cards with small text links. Fix 039 restores the original full-size cards and original group structure, keeps only one compact office-updates panel, and exposes separate **Accounting**, **Reporting**, and **Compliance** cards. It preserves the existing Trust & bank, Bank reconciliation, Reports, Audit & controls, commissions, payouts, e-signing and other Back Office modules.

## Important: this is a targeted update, not a complete source repository

The actual newest `crmsocial` GitHub checkout was not available. The installer was tested against the recovered reference archive and a synthetic Fix 038-style project. **Do not overwrite the entire GitHub repository with this ZIP.**

## Installation using a computer

1. Download a fresh ZIP from `https://github.com/inderbains/crmsocial` using **Code → Download ZIP**. Extract it on your computer. Back it up.
2. Extract Fix 039 to a different folder.
3. With Node.js installed, run:

```bash
node path/to/RealVolt039/scripts/apply-realvolt-039.mjs path/to/crmsocial-main
```

4. The script checks for the original `bo-module-card` CSS and the known Back Office integration points. It removes the duplicate standalone Office transaction updates, ensures the parent financial route exists, and adds/updates only the necessary components. Existing files are copied to a temporary backup folder.
5. Compare changes before committing. Run `npm run build` in the current repository. Do not deploy if it fails.
6. Once the build succeeds, commit the changed project files to GitHub and let Hostinger deploy.

### Browser-only GitHub editing

You cannot safely upload the ZIP wholesale through GitHub. The two application components can be uploaded to `app/`, but the `app/back-office.tsx` parent also needs a guarded merge to remove the duplicate notice card and support the Financial & compliance route. The correct merge depends on your newest source. If you work only from GitHub's website, share your latest `crmsocial` ZIP so exact replacement files can be prepared.

## What's restored

- One compact office inbox near the top (New files, Review, Upcoming, Activity), showing content only after a button is clicked.
- Original full-size orange-icon grid cards in these groups: Transactions & Review, Agents & Payments, Trust & Accounting, Brokerage Administration, Listings & Marketing.
- Three new cards using the same visual design: Accounting, Reporting, Compliance. These open the relevant tabs of the existing financial oversight panel.
- All previously available financial operations still occur in their existing modules. This panel is read-only; it does not release trust money or automate compliance approvals.

## No database changes

No Supabase SQL is needed for this UI patch. If SQL 034/035 isn't installed or user access policies differ, the notification and finance screens still require the right backend setup.

## Verification

- `node --test tests/fix-039.test.mjs` — 10 targeted structural/financial checks passed.
- TypeScript TSX syntax transpilation succeeded for the touched components.
- Guarded merge script tested against both an older reference project and a Fix 038-style copy.
- **Not verified:** the latest Hostinger production build, live Supabase integration, or browser clicks against the user's current branch.

### Visual check after installation

1. Back Office contains only one compact green updates panel; no additional huge Office Transaction Updates section above it.
2. Below that, large three-column original orange-icon module cards appear (not tiny text buttons).
3. Accounting, Reporting and Compliance cards navigate to the appropriate financial tab.
4. Existing Reports, Trust & bank, Bank reconciliation, Cheque printing, Agent payments, Audit & controls and other modules remain accessible.
5. New file and review inbox items navigate to the relevant transaction folder.
6. Agent dashboard remains unchanged by this patch.
