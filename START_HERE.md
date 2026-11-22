# RealVolt Fix 040 — One compact Back Office dashboard + Deal stages

## Why this patch

The Back Office screen showed two competing dashboards: a large standalone **Office transaction updates** panel above the office name, then another compact **Office updates** panel below the heading. The earlier **Automatic transaction workflow** was also no longer visible after the dashboard redesign.

Fix 040 **removes only the redundant office-mode top panel** and keeps the original Back Office module cards, Accounting, Reporting, Compliance, trust accounting, cheque printing and other features. It preserves the transaction workflow as an optional fifth tab, **Deal stages**, inside the existing compact panel. It is not an automation that releases commission or sends emails.

### Target screen order

1. `IB REAL ESTATE · BROKERAGE OPERATIONS` (whatever the brokerage's actual name is)
2. **Back Office** heading and Refresh
3. **One** sage-green compact Office updates panel, ~242 px tall on desktop:
   - Left: three existing small counters — submitted files, document checks, bank reconciliations
   - Right: New files, Review, Upcoming, Activity, **Deal stages** tabs with count badges
   - No tab open until the user clicks; the right-hand results scroll within this box, at most three items initially
4. Original full-size orange-icon **Applications & tools** cards, including Accounting, Reporting and Compliance

On narrow screens, the office box stacks naturally and no fixed height is forced.

### Automatic transaction workflow (restored in compact form)

This was the per-deal routing/status tracker. It computes each deal's stage, approximate progress, the responsible party (agent, Back Office or accounting), and the recommended next module/action based on existing transaction, document, trust, conveyancing and payout records. Clicking a Deal stages item opens the responsible module and stores the transaction ID for any integration already listening for it. **It is an operational checklist, not an automatic legal or financial action.**

## Recommended installation using the guarded script

**Back up your current main branch first.** Download a *fresh* checkout of the current GitHub repository and extract it. Extract Fix 040 separately. With Node.js installed, run:

```bash
node path/to/Fix040/scripts/apply-realvolt-040.mjs path/to/crmsocial-main
cd path/to/crmsocial-main
npm run build
```

The installer checks that Fix 039's **original module cards** and compact inbox exist before changing anything. It updates only:

- `app/back-office-dashboard.tsx`
- `app/SmartInbox037.tsx`
- `app/SmartInbox037.module.css`
- `app/back-office.tsx` **only when the redundant office top panel or missing `userId` is found**
- `app/realvolt-workspace.tsx` **only if an exact redundant office-only TransactionUpdates instance is found there**

No application files other than these are altered. Backups of every changed file are made in a temporary directory; the script prints the path. It doesn't change transaction state, payments, accounts, or records.

If it reports a different code structure, **don't force overwrite**. Provide your current repo ZIP so the merge can be adjusted.

## If you are working directly in GitHub's website

1. Open the repository `app/` folder and replace just these three files from the `app` directory in this ZIP:
   - `back-office-dashboard.tsx`
   - `SmartInbox037.tsx`
   - `SmartInbox037.module.css`
2. Open `app/back-office.tsx` in GitHub's editor. Find the **Back Office Dashboard** rendering branch (`if(view==='Dashboard')`). Remove the **old** panel, if present:

   ```tsx
   <section className="panel personal-dates-card"><TransactionUpdates userId={userId} office/></section>
   ```

   Keep the adjacent `<BackOfficeDashboard .../>` component. If this was the only use of `TransactionUpdates` in that file, remove its now-unused import too.
3. The `BackOfficeDashboard` opening tag should include `userId={userId}`; leave every other prop untouched.
4. **Do not remove** the agent's regular `TransactionUpdates` from `app/personal-dates.tsx`; this patch is limited to Back Office.
5. Do not upload the ZIP itself or its `scripts/`, `tests/`, or documentation as application source files.
6. Commit and wait for Hostinger. Run `npm run build` in a full local checkout first if possible.

## Verification

- The Back Office page starts at the brokerage's name; there is no top large Office transaction updates panel.
- Only one compact Office updates panel appears, **below** the Back Office heading, at the same height when tabs open.
- New files, Review, Upcoming, Activity and Deal stages count badges are visible. Results appear only after clicking one.
- Deal stages shows address, stage, progress and next responsible action; tapping opens the relevant module.
- The large orange-icon module cards still appear unchanged.
- Trust & bank, Bank reconciliation, Agent payments, Accounting, Reporting and Compliance all still open normally.
- Check one known approved listing and one firm sale; do not test with actual trust disbursements.

## Supabase / database

**No new SQL or Edge Function is required for this targeted UI patch.** It relies on the existing 034/035 database and workflow components from previous upgrades.

## Testing limitations

Eight focused source tests passed. The TSX syntax was transpiled without errors and the installer was tested on an available 039-style reference checkout (including a deliberately injected old top panel). **The current remote GitHub branch and a full Hostinger production build have not been independently verified**; only deploy after testing against a fresh local copy of the current repo.
