# RealVolt Fix 083 — privacy hardening and staging audit

**Status: targeted source-based hardening, not a completed security audit or a production-ready certification.** Based on `crmsocial-main (9).zip` (Nov 25) and the supplied Fix 080/081/082 packages. Later live migrations and deployments are not available for inspection. No live database changes have been made. Keep invitations and external onboarding paused until the tests pass.

## Confirmed source findings

| Finding | Source | Action in this package |
|---|---|---|
| Admin can select even a draft via an older permissive policy | 013_agent_profile.sql | Remove broad policy and add restrictive deal boundary |
| Accepted-offer drafts are expressly exposed to office | 063_required_accepted_offer_then_firm_review.sql | Remove draft exception; require submitted, approved or changes-requested state |
| Privileged marketing summary exposes personal CRM counts, per-agent metrics and social plans | 020_marketing_office_and_post_sale.sql | Revoke direct client execute; replace dashboard with privacy notice |
| Shared sales leaderboard exposes other agents' performance and falls back to private profile name | 033/034 transaction lifecycle | Replace with security-invoker report: own data for agent, authorized submitted-file data for admin |
| CRM, personal profile, personal dates, social drafts, Open House check-ins already have owner policies | 003/008/schema/021 | Add restrictive owner guard on known private tables; do not widen grants |
| Documents inherit parent visibility; storage bucket can be a separate exposure surface | 004/034/044 | Enforce visible parent for client reads; set transaction-files bucket private |
| Membership directory exposed to all same-office members | 005 | Restrict directory to own membership or office admin |
| Internal compliance seeding helper is SECURITY DEFINER without an owner check in saved source | 044 | Revoke direct authenticated execution; retain trigger/owner usage |

## Safe installation order

1. Back up current GitHub and database. Use a separate staging Supabase project with synthetic data. Do not copy production customer files to an unsecured test environment. Confirm 081/082 and the current migrations are deployed there; do not rerun older migrations wholesale.
2. Run `supabase/VERIFY_083_READ_ONLY.sql` in staging SQL Editor first. Execute the SELECT statements individually if the editor only shows the final result. It returns catalog policies, grants, function signatures, views and bucket configuration, not client records. Save results locally for comparison. Do not share service-role keys, personal data, access tokens or signed URLs.
3. Compare the actual schema and existing functions against the migration. Run `supabase/083_privacy_guardrails.sql` once on staging. It is wrapped in a transaction and adds no new grants except the already-existing authenticated leaderboard execute permission. Optional missing tables are reported; investigate them rather than assuming complete coverage. On failure, do not proceed. Do not disable RLS to work around errors.
4. Upload only `app/office-marketing-dashboard.tsx` into the current GitHub staging branch, after comparing it to the current file. This deliberately disables the old personal-data report. No other frontend file is replaced. Build and test staging. A current full repository is required to make the leaderboard wording accurately distinguish 'My sales' versus admin report; the existing labels may still say 'leaderboard'.
5. Run `VERIFY_083_READ_ONLY.sql` again and complete the live tests below. Use the current build, two different browser profiles and ordinary authenticated JWTs, not the service role. The SQL patch is not a substitute for these tests. Production rollout only after all regressions and independent review are complete.

## Behavior changes to review explicitly

- Back Office will no longer read Accepted Offer records in Draft state, even if the old workflow sends an informational notice. An existing notification or listing-status display may therefore be hidden or differ until formal submission. Do not reopen all drafts to fix this: implement explicit accepted-offer sharing as a separate authorized operation if needed.
- `Changes requested` counts as previously shared, as does `Approved`. This is based on existing review states, not an immutable submission manifest. Verify the live transitions cannot be forged. Additional documents on a previously submitted record may remain visible; a true per-version submission snapshot is still needed if every later draft attachment must remain private until resubmission.
- The old office marketing report is unavailable; personal marketing remains. Sales report returns only own submitted firm sales for ordinary agents, and authorized office submitted firm sales for admins. Shared rankings across agents are deliberately removed. The brokerage monthly goal counts the rows returned by the authorized report.
- Public property pages, published Open House flyers, marketing photos and public agent sites are intended publication exceptions. They must contain only explicitly public material. Unpublished images in existing public buckets are not necessarily private; audit/migrate those buckets before launch. Already issued signed URLs may remain valid until expiration.
- Office roster/licensing/fee/payroll records are business administrative records, not private agent workspace profiles. Existing roster and statutory financial access remain; review fields and permissions with the managing broker.

## Mandatory staging test matrix (not yet executed)

Create admin A, agent A1, agent A2, admin B and agent B1; also independent agent C. Use unique test emails and identifiable synthetic records for every account. Test each private module: CRM contacts/notes/tasks/pipeline, profile/settings, calendar/reminders, Open House visitor check-ins, brand kits, social drafts, ads, email drafts, AI history. For each caller verify own rows visible; every other owner's rows denied (including admin of same office); direct guessed IDs and writes denied. Test unfiltered queries as well as guessed IDs, updates, insert with forged owner, delete and relationship joins. Test private document storage with own and unauthorized paths and signed URL creation, including anonymous requests. Verify owner and both authorized admins can see submitted files only within their own office; a different agent cannot. Check draft/accepted offer/submission/change request/firm sale/approved/closed file transitions, admin-as-agent review and accounting. Verify original agent retains authorized access. Ensure old notifications don't reveal drafts and no stale content remains after account switching. Open fresh invitations while logged in as a different user; verify invited email, expired/reused links, password setup and correct role/tenant. Direct API/RPC calls and Realtime subscriptions must be tested separately. Check anonymous visitors can access only published information and cannot enumerate check-in data. Verify office marketing RPC denied; leaderboard returns only allowed rows; test report counts. Test 1000 simulated users after isolation passes (load tests do not prove privacy).

## Remaining blockers before launch

- Full live policy/grant/function inventory; review all SECURITY DEFINER RPCs, including lifecycle actions, compliance refresh and finance/notification functions. RLS does not protect against service-role access or unguarded definer functions. `rv_refresh_brokerage_compliance` in the saved source also loops over drafts; needs a separate guarded rewrite. Verify all explicit grants, database views, storage and Realtime channels.
- Audit all deployed Edge Functions and server routes, especially closing-packet, agent-office, Meta, billing, automation and signing. Fix 083 does not replace them. DDF and SignVolt source contains office-level access paths; both are deferred from 1.0, but hiding menus does not disable backend access. Disable unused endpoints/grants or audit them before launch; do not assume they are private.
- Inspect actual auth sessions and cross-account client caches; Fix 082 needs live testing. If actual data was exposed, retain access logs, investigate affected accounts and assess required notification under applicable privacy obligations. Do not include real personal details in testing screenshots.
- Audit public storage, backup access, administrative credentials and actual tenant membership integrity. Add automated authenticated negative tests to CI, complete security review and monitor abuse. No proof of complete privacy or capacity is claimed.

## Validation

Five Node static tests cover migration structure, restrictive guards, storage boundary, report scope and read-only audit. They do not execute SQL or prove RLS behavior. No live database credentials or PostgreSQL runtime were available; no production build or live access tests performed. Run `node --test tests/privacy-083.test.mjs` to repeat the static checks.
