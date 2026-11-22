# RealVolt Fix 042 — Agent Performance + Duplicate Transaction Actions

## What this patch actually changes

1. **Back Office → Agents → [Agent]** gets a compact Agent Performance Summary: This month / This year / Lifetime, listings taken, firm sales, firm sales volume, earned agent allocation (pre-GST), net paid commissions (incl. applicable GST), and authorized but unpaid commission.
2. **Agent → My profile & billing** gets the **same summary scoped to that agent's signed-in account**. Supabase queries explicitly filter `user_id` and `brokerage_id`; underlying RLS still must be correctly configured. The account must be linked to the agent profile.
3. The installer examines the **actual** `app/transactions.tsx` in your current checkout, finds the `TransactionActions` JSX calls and **removes repeated calls for the same active transaction**. It refuses to guess if there are different call sites or unsupported source layouts. It doesn't disable any action.
4. Original Back Office styling, your current accounting/trust/CIR modules, and database migrations remain untouched.

## Important: safe installation against CURRENT GitHub project

The source code available to create this patch was a previous RealVolt project version. Your live branch may have newer changes. **Do not upload this entire package into the GitHub root and do not overwrite the whole repository.** Use the merge installer on a freshly downloaded `crmsocial` checkout. The installer checks the code structure, creates `.txt` backups and aborts when it cannot safely locate the correct integration points.

1. In GitHub, choose **Code → Download ZIP** for `inderbains/crmsocial`, extract it locally.
2. Download and extract this Fix 042 ZIP separately.
3. Open a terminal in the current `crmsocial` folder and run `npm install` (requires Node 22+).
4. Run the installer with the target repo path:

   ```bash
   node /path/to/RealVolt_Fix_042/scripts/apply-realvolt-042.mjs /path/to/crmsocial
   ```

   Windows PowerShell example (replace the actual folders):

   ```powershell
   node "C:\Users\YOU\Downloads\RealVolt_Fix_042\scripts\apply-realvolt-042.mjs" "C:\Users\YOU\Downloads\crmsocial-main"
   ```

5. Then run inside your `crmsocial` folder:

   ```bash
   npm run build
   node --test tests/agent-performance-042.test.mjs
   ```

6. Only after a successful build, upload/commit the **changed application files** to GitHub main. The installer may change:

   - `app/office-agent-profile.tsx`
   - `app/agent-account.tsx`
   - `app/transactions.tsx` (only if multiple identical `TransactionActions` calls are found)
   - `app/agent-performance-summary.tsx` (new)
   - `app/agent-performance-summary.module.css` (new)
   - `lib/agent-performance.ts` (new)

7. Rebuild on Hostinger. Test one agent who has accepted an invitation and has at least one firm sale. Open an active sale file: **Transaction actions** should appear once. Verify the filters with real transaction dates and the agent's own payouts.

### No SQL or Edge Function deployment

This is a UI and read-only metrics change using the existing `deal_files`, `agent_commission_allocations` and `agent_payouts` schema. It depends on lifecycle SQL 034/035 already having been installed.

### Accounting and reporting definitions

- **Listings taken:** listing files dated in the selected period. A linked sold listing isn't counted twice.
- **Firm sales:** Sale records with a recorded firm date and stage Sold, Completed, or Archived. Accepted offers, collapsed offers and unconfirmed historical sales are excluded. Monthly/yearly reporting uses the **firm sale date**.
- **Sales volume:** accepted sale prices for those firm sale files (not commission, not received cash).
- **Commission earned:** admin-confirmed agent allocations **before GST**, for reviewed and legally Completed/Archived deals with actual completion dates. An amount does not imply the money has been collected.
- **Commission paid:** payout records marked **Paid** using their actual paid date, net including applicable GST and after deductions. It is not subtracted again from 'earned'.
- **Authorized, unpaid:** authorized agent payouts not yet marked Paid; not proof funds were released.
- **Missing allocations:** completed files without an agent commission allocation are disclosed, not guessed.

The counters are scoped by current agent, brokerage and access controls. No commission release or trust withdrawal is performed.

### Known limitations and testing

- A full Hostinger production build on your latest GitHub branch has **not** been run here; the local baseline was an earlier copy. Tests of the calculation helper and a synthetic nine-duplicate action instance passed.
- If you still see repeated actions after installing, your current app may render them via a different parent component or code path. The installer intentionally refuses to remove unknown JSX. Send the actual deployed `app/transactions.tsx` and `app/transaction-actions.tsx` for the exact remaining merge.
- No SQL, missing documents, deposit or payment records are deleted or edited by this patch.
