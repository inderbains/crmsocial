# RealVolt Back Office — installation and operating guide

Release 0.6.0 (BackOffice v1). This update adds brokerage agent profiles, invitations, compensation plans, monthly fee records, commission payout authorization, trust/operating ledgers, CSV bank reconciliation, office reports, audit checks and office settings. It retains the existing transaction-review, lawyer documents, CRM, Social Studio and personal workspace features.

## Install in the existing project

1. Extract this ZIP into a NEW folder. Upload its application source to the existing GitHub repository, replacing existing files. Keep Hostinger's environment variables. Build command: `npm run build`; output directory: `out` (this project is a static export).
2. After migrations 001–008 are installed, run ONLY these new SQL files, once each and in order:
   - `supabase/009_agent_management.sql`
   - `supabase/010_back_office_finance.sql`
   - `supabase/011_card_billing.sql`
   Run all three before using the new screens. Do not rerun earlier migrations.
3. Open Back Office. If your account has no brokerage membership, use Create your brokerage workspace to enter its real name and email and become that NEW brokerage's admin. Existing agents cannot use this to promote themselves inside someone else's brokerage. If a brokerage invited you, accept that invitation in My profile & billing instead. An existing admin membership is reused. Existing unassigned draft/change-requested files owned by the new admin are linked; historical approved files need reviewed database migration if any remain unassigned.
4. Hire a test agent using a DIFFERENT email/account from the admin. Enter their profile, licence, start date, split, fees, GST rates, collection method, assigned reviewer and notes. Save, then send the invitation. Agents finish their profile under My profile & billing and can use CRM, Transactions, Social Studio and personal dates. Admin permissions are granted separately after enrollment.

## Deploy server functions

From this checkout with the Supabase CLI linked to your project:

```
supabase functions deploy agent-office
supabase functions deploy billing-webhook
supabase functions deploy closing-packet
```

All functions have gateway `verify_jwt = false` in the supplied config. The agent-office and closing-packet functions verify the user's JWT with auth.getUser and check brokerage permissions themselves. The public billing-webhook verifies Stripe's signature against the exact raw request body. Do not remove those checks.

Set server-only function secrets:

- `APP_URL`: the deployed app URL, without a trailing slash.
- `RESEND_API_KEY` and `CLOSING_FROM_EMAIL`: configured verified invitation/conveyancing sender.
- `STRIPE_SECRET_KEY`: platform/server Stripe key.
- `STRIPE_WEBHOOK_SECRET`: signing secret for the configured webhook endpoint.

Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never put service-role, Stripe secret or email secret keys in NEXT_PUBLIC variables. Configure Supabase Auth Site URL/allowed redirect URLs to include APP_URL and its onboarding query URLs. Auth link expiry remains controlled by Supabase; resend an invitation if its sign-in link expires.

Configure Stripe in TEST mode first. Add the brokerage's mapping to `brokerage_payment_accounts` using the SQL example in 011. For multiple brokerages, use the proper Stripe Connect account ID and that account's exclusive GST tax rate ID. A single brokerage can use the platform account with a NULL connected-account ID; only one brokerage can have that mapping. Payment mappings are not client-writable. This build does not include a Stripe Connect OAuth onboarding screen; provision mappings through reviewed project-owner setup.

The Stripe tax rate must equal the agent plan's fee GST rate and be exclusive. Agents enter card details only on Stripe-hosted Checkout; RealVolt stores customer/subscription identifiers on the server, never card numbers. Enable Stripe's customer portal for card updates and subscription cancellation. Expose the billing-webhook URL as a Stripe snapshot webhook endpoint and include checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.deleted, charge.refunded, charge.dispute.created and invoice.voided. Configure platform/connected-account event delivery to match the account mapping. Use snapshot API version 2025-02-24.acacia, matching the pinned Stripe SDK. Do not rely on the Checkout success page as proof of payment.

## Agent agreements and monthly billing

Defaults: office fee $100, software fee $49, board fee $0 monthly; 80% agent / 20% brokerage split; 5% fee GST and 5% GST on agent commission. Choose 70/30, 80/20 or another agreed percentage. Enter actual agreed rates, fees and GST registration details; the system does not verify licence or tax registration.

Credit card is the default collection method. After enrollment, the agent explicitly sets up the subscription in My profile & billing. Once configured, Stripe charges monthly automatically on the subscription anniversary. Verified paid invoices update the fee records. Card payment failures appear in Audit & controls and Stripe; failed/outstanding card fees are NOT silently deducted from cheques. Refunds, disputes, credits, discounts, prorations or nonstandard invoices need manual reconciliation; supported regular full invoices are applied automatically. Billing configuration is required before any live automatic collection can work.

Cheque-method monthly fees accrue by calendar month when the office requests accrual, edits an enrolled plan, or authorizes a payout. All missing months through the selected date are generated once. There is no daily app scheduler for cheque-fee accrual; payout preparation catches up the ledger. Start/end months are billed in full; automatic prorating is not implemented. Existing bills preserve their original amounts/GST. Saving a changed plan accrues the prior terms through the selected current/end period before changing future unbilled fees. Split application uses the current agreed profile plan; review the resulting allocation before authorization.

Collection method is locked after billing starts to prevent the same month being collected through both card and cheque. A reviewed billing migration is needed to change it. Cancel an existing live Stripe subscription before changing card-billed monthly amounts, fee GST or agent status. Enrolled email/start date changes need reviewed account correction. Marking a profile Inactive prevents brokerage access through the brokerage helpers; personal agent-owned CRM/workspace data is retained. Do not treat profile status as deletion of a Supabase Auth account.

## Commission and cheque flow

1. Agent submits a sale and documents. Admin checks all required documents and approves the complete file.
2. In Agent payments, select the sale and Apply agent split + GST. The allocation is based on that transaction's listing-side or selling-side commission BEFORE GST and the agreed agent percentage.
3. Review the allocation and any per-deal office charges under the transaction review screen. Authorization uses the saved allocation, not an unreviewed browser calculation.
4. Authorize payout for a completed, approved sale. Only outstanding cheque-method monthly bills are included. Row locks and unique records prevent reusing the same monthly bill or authorizing a second payout for the same deal. Fees exceeding available commission block authorization rather than generating a negative cheque.
5. Authorization freezes an itemized snapshot and the financial entries. Download the payout PDF showing payee, allocation, GST, individual fees, total deductions and net payable.
6. Issue the actual cheque/payment outside this app. Then record its actual date/reference and operating account. This posts the operating ledger and marks the payout Paid. The app does not initiate a bank transfer or produce a negotiable/MICR cheque.

Example, no other per-deal charges: $10,000 side commission at 80% gives $8,000 agent commission + $400 GST. If $149 monthly fees are being collected from this cheque, add $7.45 fee GST and net payable is $8,243.55. If those fees are card-collected, the cheque is $8,400 and the $156.45 monthly card charge is separate.

## Trust, banking and reconciliation

Add separate Trust and Operating accounts. Enter expected deposits on transactions; record actual receipts/releases in Trust & bank with date, file and reference. Externally held deposits are not automatically posted as our trust money. Trust postings require a file and cannot over-release its recorded funds. Start trust accounts at zero and allocate opening funds to the proper file ledgers. Operating opening balances can be entered when setting up the account.

Import bank CSV with date, description, amount (signed), and optional reference columns; maximum 2,000 rows. Dates use YYYY-MM-DD. Repeated identical imports are fingerprinted and skipped. Use unique bank references where possible; indistinguishable identical rows require review. Match equal amounts within the same account. This version uses manual matching and requires every bank/ledger item through the closing date to match before sign-off; outstanding-cheque timing adjustments and grouped/split bank matches are not implemented.

Sign-off compares the statement closing balance to the ledger and, for trust, total file balances. Signed-off dates are frozen against backdated postings/imports. Reconcile all active accounts at the closing date before locking the period. Corrections are offsetting entries in an open period; original entries remain. There is no live bank feed, automated money movement or assertion that an entered deposit has actually cleared the bank. Stripe settlement amounts and processing fees must be posted/matched to the bank separately; paid fee records are not a fictional bank deposit.

## Reports, permissions and audit

Dashboard: review queues, unverified requirements, upcoming completions, deposit expectations/trust balances and unpaid authorizations. Reports: agent production, recorded side commission, agent allocations/GST, retained brokerage amounts, monthly fee statuses, bank balances and signed reconciliations. Export commission CSV or print/save reports as PDF. Revenue reports are provisional for files with missing allocations and are not tax returns. Existing agent reports show per-deal fees/net earnings, plus separate monthly card-fee expenses. The yearly recorded GST summary includes paid card-fee GST by billing month, without subtracting those fees again from commission cheques.

An admin can grant/remove admin permissions for enrolled members, retain at least one admin, and assign reviewers. All office records are brokerage-scoped. Agents can read their profiles, bills and payouts but cannot edit their agreed split or office deductions. Admins in the same brokerage can review files; conveyancing email remains restricted to the assigned reviewer. Settings include brokerage identity and editable CIR/letter text around the generated financial figures.

Audit & controls records profile/plan changes, monthly bills, payouts, bank imports/postings/matches, sign-offs and period locks. It flags unmatched records, missing allocations/documents, card failures and external-deposit inconsistencies. These are application controls and an activity trail, not an independent audit opinion. Payout reversal/voiding, clearing a wrong bank match, exceptional fee migrations and corrections to finalized figures require reviewed database/accounting procedures in this first version; no destructive correction buttons are provided.

## Verification and first live test

The app and three Edge Functions pass TypeScript checks. Automated tests cover 70/30 and 80/20 math, GST, verified/invalid Stripe signatures, account mapping, invoice totals and retries. Local PostgreSQL-compatible checks cover invitation acceptance, tenant permissions, fee deduplication, exact cheque math, payout locks, payment posting, trust over-release protection, reconciliation and period locks.

Invitations, hosted Checkout, production webhooks and bank data have NOT been exercised against your live accounts. Before using live funds, complete one admin/agent test-mode path end to end: invite → verified acceptance → card setup → successful and failed test invoice → submitted/approved sale → split → deductions → authorized statement → recorded test payment → statement import/match → sign-off/lock. An email invite or a card subscription is not activated merely by uploading this ZIP.

The optional local database harness is verification/back-office.mjs. Install @electric-sql/pglite in a disposable local checkout and run that script to repeat its checks. It creates only an in-memory database, not your live Supabase project.
