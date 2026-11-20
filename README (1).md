# RealVolt Real Estate CRM — Phase 1 Upgrade (November 18, 2026)

**Add-on for the existing RealVolt Next.js + Supabase application**, not a replacement app. Built against the publicly viewable `inderbains/crmsocial` structure (not a cloned working tree or verified production Supabase schema). Does not modify `app/page.tsx`, existing `app/crm.tsx`, Transactions or Back Office.

## What works after installation

- `/real-estate-crm` page: elegant dashboard with contact KPIs, existing CRM contacts, filtering, Kanban-style stage columns, tasks and notes.
- Reuses **existing** `crm_contacts`, `crm_notes`, `crm_tasks`, `deal_files`, and existing Supabase authentication. No second customer master list.
- Buyer/seller preference profiles (property type, locations, bedrooms, bathrooms, purchase timeline, financing, motivation). Optional opt-in for AI draft generation.
- Link a contact with existing **owner-owned** transaction records, or create a draft deal and link it to the CRM contact. Back Office remains separate and authoritative.
- AI draft API: drafts email/SMS **text only**, must be enabled per contact and needs `OPENAI_API_KEY` server-side. A saved draft is **not sent**. Opted-out contacts are blocked.
- Agent-owned RLS for new tables. No cross-brokerage or admin broadening of existing CRM access.

## Installation

1. Create a backup branch and a **staging** Supabase backup. Review the current migration history and schema.
2. Copy the provided `app/` files into your existing project `app/` directory, preserving directory structure. **Do not replace** existing files.
3. Run `supabase/rvcrm_20261118_real_estate_phase1.sql` once in the **staging** Supabase SQL Editor. It assumes existing `crm_contacts`, `crm_tasks`, `crm_notes`, `deal_files` tables. Review and confirm the final schema before production.
4. Your existing project has `@supabase/supabase-js` and `lucide-react` installed, and `getSupabase()` exported from `lib/supabase.ts`. Confirm public env variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are already set.
5. For optional AI **drafting only**, add `OPENAI_API_KEY` as a **server-only** environment variable in Hostinger. Optionally set `OPENAI_MODEL`. Never place an API key in `NEXT_PUBLIC_*`, source code, or GitHub. AI model usage incurs provider charges.
6. Run `npm run typecheck`, `npm test`, and `npm run build` against the merged full project. Log in and navigate to `https://YOUR-HOST/real-estate-crm`.
7. Once tested, add one existing navigation item in `app/page.tsx` or your nav component that links to `/real-estate-crm` (or open the route directly). **Do not replace** the existing `app/page.tsx` or login flows.
8. Only deploy after integration tests on a staging host, including two agent accounts in different brokerages.

## Smoke tests (required)

- Sign in as Agent A; add one Buyer. Verify the same contact appears in the **original CRM**.
- Save preferences and notes; confirm they persist after refresh.
- Create a draft transaction from the client; verify it appears in **Transactions**, retains the client name and property address, and is linked back to CRM.
- Link an existing owned deal; verify it appears on the client profile.
- Sign in as Agent B in another brokerage: Agent A's CRM profiles, notes, tasks, deals, and AI drafts must not be accessible.
- Test a brokerage admin: no implicit access to agents' private CRM data. Do not bypass RLS to reveal private contacts.
- Opt a contact out in the original CRM: AI draft creation must be blocked.
- Enable AI drafts for a test contact, configure server API key, generate a draft; it must **not** send email or SMS or create an outgoing message.
- Confirm only authorized users can call `/api/rvcrm/ai-draft` and cannot draft against another user's contact ID.

## Scope / important limitations

- **Not deployed or merged:** the ZIP is a ready-to-merge source patch only. No production access or GitHub write permissions were available.
- **Not yet autonomous outreach:** AI drafts do not send, reply, call, schedule appointments, automatically process leads, or run on a timer. Sending requires proper provider OAuth/permissions, CASL consent handling, opt-outs, and a supervised action queue. Task reminders currently depend on users creating tasks; automatic scheduled follow-up is a next phase.
- **Not an AI CMA:** valuation needs authorized sold comparable data and a verifiable price methodology.
- Existing transaction type is inferred as `Listing` for a Seller and `Sale` otherwise; for a Buyer & seller, choose correct transaction type in Transactions. All generated deals start as **Draft**. Never automate review approvals, commission releases, or trust transfers.
- The existing CRM is **owner-private**. This patch intentionally does not enable brokerage-wide contact visibility. For shared/team CRM, design explicit tenant membership and record-sharing RLS first.
- AI draft content and limited client preferences are sent to the selected model provider when the user clicks Generate; review consent, privacy notices and data handling before use with real client data.
- Includes basic per-user request guard; add atomic billing/rate limits and monitoring before public launch.
- Current page fetches records in batches up to 50,000; implement server pagination and indexes for high-volume production workspaces.
- If newer production migrations changed legacy table names or requirements, adapt and test this patch before applying.

## Next implementation phases

1. Native navigation integration + test full build; create streamlined single-contact view in the original CRM.
2. Secure automated lead intake with deduplication, consent capture and assigned-agent mapping.
3. Background follow-up scheduler and agent approval inbox; email provider and opt-out handling.
4. AI conversations and appointment booking after provider setup; buyer match once approved listings/DDF data is available.
5. Broker-approved CMA and back-office document warnings, always with audit logs and human review.
