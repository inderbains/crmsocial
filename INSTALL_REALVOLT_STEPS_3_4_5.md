# RealVolt — CRM Steps 3, 4 and 5 Upgrade

**A merge patch for your EXISTING `inderbains/crmsocial` Next.js + Supabase project.** No duplicate CRM, no replacement sales funnel or website builder. The visual design stays spacious, light and forest-green.

## What is actually included

### Step 3 — Automatic funnel upgrades
- **Qualified:** A *Contacted* Buyer is promoted to Qualified when a CRM profile includes a preferred area, budget ceiling, purchase timeline, and financing status. A Seller requires area, timeline and motivation. This is a **deterministic qualification rule** (not a lender pre-approval or AI guarantee). Complete these fields in your existing `/real-estate-crm` client profile, or other UI that writes to `rvcrm_real_estate_profiles`.
- **Offer submitted:** Open `CRM → Deal Milestones`, select a contact and an existing linked transaction, and record the verified offer evidence. If the contact is New/Contacted/Qualified, RealVolt moves the existing CRM stage to Active. **The funnel does not gain a duplicate Offer column.** Offer is an auditable deal event.
- **Firm contract:** With explicit signed-off evidence, RealVolt advances that linked contact to Under contract. It does **not** infer firm status from brokerage review status or a subject date.
- **Completion confirmed:** After a firm milestone and a recorded non-future actual completion date in the existing Transactions module, the agent can explicitly confirm completion. RealVolt changes the linked CRM contact to Closed and adds a 7-day post-sale check-in task. It does not send emails, release trust, or change a transaction's review status.
- Milestones are append-only owner-private records. Manual drag-and-drop stage changes remain available in your separately installed pipeline patch.

### Step 4 — Scheduled follow-ups
- The existing secret-protected `/api/rv-automation/run` route still executes enabled CRM Automation Studio workflows (tasks, notes, **email drafts only**).
- It can additionally find stale leads by their per-contact `followup_cadence_days` (7 days by default), **only if** there is no open task. It creates one agent-private reminder task and a deduplication record. No automatic emails, SMS, or calling.
- **Safety flag defaults OFF**: add `REALVOLT_ENABLE_STALE_LEAD_NUDGES=true` on the *server* **only after staging validation**, because existing old leads could otherwise generate many reminders. The worker caps stale reminders to 25 per invocation. Regular existing automation workflows are independent of this flag.
- The worker must be invoked by a real Hostinger cron. SQL triggers alone cannot run delayed jobs.

### Step 5 — Agentic AI Studio
- New sidebar entry `CRM → Agentic AI` provides CMA, listing descriptions, social captions, and lead next-step suggestions.
- **CMA:** Enter 3–12 verified comparable closed sales (address, sold price, finished area, date), plus subject address, beds, baths and finished area. The midpoint uses **median sold price per square foot × subject area**. The ±8% display is **illustrative only**, not statistically calibrated or a market appraisal. No MLS/DDF/comparable-sales feed is fetched. Optional AI writes an explanatory draft if an API key is configured; otherwise the transparent calculations still work.
- Listing descriptions and marketing captions require server-only `OPENAI_API_KEY`; they must be reviewed for factual accuracy and fair-housing compliance.
- Lead next steps use a **JWT-authenticated, user-owned CRM contact** and their existing profile, activity types and tasks. Opt-out contacts are not used for outreach drafts.
- CMA reports can be printed or exported to PDF to attach to an agent-written email. Nothing is sent or published automatically.
- A 15-successful-requests/hour best-effort database usage guard is included, **not a production-grade atomic rate limiter**. Add gateway-level rate limits and usage/billing controls before customer launch.

## Install order (important)

1. **Backup** the live Supabase database and GitHub branch. Deploy to staging FIRST.
2. Run this READ-ONLY prerequisite check in Supabase SQL Editor:

```sql
SELECT
 to_regclass('public.crm_contacts') IS NOT NULL AS crm,
 to_regclass('public.deal_files') IS NOT NULL AS transactions,
 to_regclass('public.property_showing_requests') IS NOT NULL AS showings,
 to_regclass('public.rv_auto_workflows') IS NOT NULL AS automation_engine,
 to_regclass('public.rvcrm_real_estate_profiles') IS NOT NULL AS crm_profiles,
 to_regclass('public.rvcrm_contact_deals') IS NOT NULL AS linked_deals;
```

All six must be `true`. The first four should already exist. **If the last two are false**, install the original `supabase/rvcrm_20261118_real_estate_phase1.sql` from your existing project on staging first. Do not blindly rerun `023_crm_automation_engine.sql` (it has non-idempotent policy creation and was already verified installed).

3. With prerequisites satisfied, run SQL migrations in this exact order on **staging**:
   - `supabase/031_deal_milestones_followups.sql`
   - `supabase/032_ai_studio_usage.sql`

   Neither migration deletes existing CRM or transaction tables. They are additive and replace only their own named trigger functions/policies on rerun. Do not run these before a backup.
4. Unzip the patch **outside your GitHub repo**. Merge folders into their **matching** paths. Do **not** upload the ZIP itself into the repository, and do not upload `route.ts` at the repo root.
5. The **two existing files** being changed are:
   - `app/realvolt-workspace.tsx` — imports and navigation for the two new screens. Read `WORKSPACE_ONLY_CHANGES.diff`; merge these changes with any newer GitHub edits instead of overwriting a newer file.
   - `app/api/rv-automation/run/route.ts` — adds the opt-in stale-lead scan to the **existing** worker. Preserve any newer worker improvements.

   All other paths are additive; no modified `app/crm.tsx`, website builder, or CSS from your existing screens is included. If you installed the prior Drag-and-Drop ZIP, keep it installed.
6. Add these **server-side only** Hostinger environment variables (never put secrets in code, GitHub, or chats):

```text
OPENAI_API_KEY=<your private OpenAI API key>        # needed for AI text; CMA math works without this
SUPABASE_SERVICE_ROLE_KEY=<your private service key> # needed for cron worker
REALVOLT_AUTOMATION_CRON_SECRET=<long random secret> # at least 24 characters
REALVOLT_ENABLE_STALE_LEAD_NUDGES=false             # switch to true only after testing
```

   Keep your existing `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` settings as they are. Never prefix secret keys with `NEXT_PUBLIC_`.
7. In Hostinger, configure a server cron to call your LIVE or STAGING URL every 5 minutes (one per environment). Example command with secrets supplied by the cron environment:

```bash
curl --fail-with-body -sS --max-time 30 -X POST \
  'https://YOUR-DEPLOYED-DOMAIN/api/rv-automation/run' \
  -H "Authorization: Bearer ${REALVOLT_AUTOMATION_CRON_SECRET}"
```

   Confirm that the cron environment actually exposes the secret; Hostinger's app environment variables may not automatically carry into the cron shell. Do not paste the secret into screenshots or chat.
8. On your local checkout: `npm install`, `npm run typecheck`, `npm test`, `npm run build`. Re-deploy after SQL success. **The provided ZIP has not been installed into your live GitHub repository by ChatGPT.**

## Staging acceptance tests

- **Qualification:** Set a test Buyer to Contacted. Save area, budget ceiling, purchase timeline and financing status in the existing client profile. Verify stage becomes Qualified, with one `rvcrm_qualification_audit` record. Repeat with incomplete fields—stage must not auto-qualify. Do not describe this as financial pre-approval.
- **Offer:** Link a test CRM contact to an owned test transaction, and use Deal Milestones. Verify Offer submitted changes an early contact to Active and records evidence.
- **Firm:** Record a verified firm contract, verify Under contract. In another test, mark a deal Approved in Back Office **without recording firm**; that alone must not advance the CRM.
- **Closing:** Set a legitimate, non-future completion date in the test transaction and record firm first. Confirm completion using the explicit confirmation prompt. Verify Closed and one 7-day post-sale task. Try before firm or with a future completion date; it must reject.
- **Follow-ups:** Enable a small test `contact_created` workflow in CRM Automations and invoke cron using the private auth header; check for queued or completed steps and **drafts only**. With stale nudges disabled, the response reports `staleLeadNudgesEnabled:false`. On staging only, enable the flag and test one old, open-task-free contact; confirm exactly one reminder and no duplicate on immediate rerun.
- **Agentic AI:** Enter three real sold comps, verify transparent median math, copy the report and export PDF. Try fewer than three comps and a future sale date; both must fail. Check Agentic AI login, other-agent contact access denial, and that captions and email drafts are not automatically published/sent.
- **Tenant safety:** Repeat user A / user B tests. Confirm one user cannot see the other's milestones, contacts, AI log, or tasks. Verify existing drag-and-drop, the original funnel, property websites, marketing automations, and Back Office are unaffected.

## Current validation / limits

- The new CMA tests and static integration tests pass, and the existing CRM/automation regression tests passed in the saved local snapshot.
- All added TypeScript/TSX source files passed TypeScript *syntax parsing*. This is **not equivalent to a full TypeScript type-check**.
- **Full dependency install, Next.js production build, live Supabase migrations, real cron, and end-to-end browser tests have NOT been completed** in this environment. Run them on staging.
- The patch was built against the last saved `RealVolt_Full_Project_Corrected.zip` plus the prior 023/030 upgrade—not a fetch of your live GitHub main branch. **Merge; do not blindly replace newer files.**
- There is no live Meta webhook or automatic offer detection from document OCR/MLS. A real agent records supported deal milestones; RealVolt then updates the CRM automatically. No auto-sending or auto-publishing is provided in this phase.
