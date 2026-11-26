# RealVolt Fix 071 — Normal legal completion (no lawyer email prerequisite)

**Based on:** Fix 070 Back Office workflow. Do not replace the whole repository.

## Only one GitHub application file

Replace `app/transactions.tsx` with the included version **inside the `app/` folder**, not at the GitHub repository root. All other files stay unchanged.

## One Supabase SQL update

1. Back up the Supabase database and test against staging.
2. Run `supabase/071_allow_completion_without_cir_email.sql` in Supabase SQL Editor. This removes only the `rv070_completion_after_cir` trigger and its function from Fix 070; it does not delete records or disable other permission checks.
3. Run `supabase/VERIFY_071_READ_ONLY.sql`. The output `cir_email_gate_still_installed` should be `false`.
4. Upload `app/transactions.tsx` in GitHub's `app` folder, commit, and allow Hostinger to rebuild.

## Updated Back Office sequence

- Agent submits the firm-sale documents, lawyer and financial information.
- Back Office verifies documents and **approves** the file.
- **CIR & Lawyer Email** remains available after approval, but can be used later.
- **Legal Completion** is immediately available to authorized Back Office admins after approval; it requires the **actual completed date** and a **lawyer completion letter PDF**. No email needs to be sent first.
- After completion, use existing commission receipt verification, trust/operating accounting, agent payout, and reconciliation workflows.

**Important:** Confirming legal completion does not itself mean that commission funds were received or that agent payout happened. Only record receipt when verified against bank proof. No fake email deliveries or financial transactions are created. This change makes the CIR-email gate optional until you decide to enforce it again. An actual CIR email is still advisable in a real conveyancing workflow.

## Validation

- TypeScript syntax parsing and focused structural checks passed.
- This change has not been live-tested on Hostinger or Supabase. The `rv_tx_action` existing role and document checks remain unchanged.
- For real transactions, preserve all actual lawyer instructions, written authorizations, and brokerage trust/compliance obligations.
