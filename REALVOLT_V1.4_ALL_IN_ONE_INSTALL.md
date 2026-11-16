# RealVolt v1.4 — Consolidated Marketing Modules 8–18 + Hostinger Calendar Fix

**Install over your existing RealVolt project. This ZIP is a changed/dependency-files package, NOT a fresh app and NOT a database backup.**

## What's in this update

| Module | Code location | Ready to use after SQL? |
|---|---|---|
| #8 Content Calendar | app/content-calendar.tsx, lib/content-calendar.ts, app/page.tsx | Drafts, planning, review queue — YES. No live publishing. |
| #9 Meta Ads Manager | app/meta-ads.tsx, lib/meta-ad-planner.ts, migration 019 | Campaigns, template/creative choice, budget, goal, account selection — YES, as plans only. |
| #10 Meta Lead Integration | app/meta-lead-import.tsx, lib/meta-leads.ts | Manual CSV import to agent CRM — YES. Webhooks LATER. |
| #11 Office Lead Routing | app/office-lead-rules.tsx, lib/lead-routing.ts | Admin rule setup and routing preview — YES. Automatic cross-agent assignments LATER. |
| #12 Email Connections | app/email-center.tsx, migration 017 | Saved identity settings and campaign drafts — YES. OAuth, inbox and sending LATER. |
| #13 Buyer Matching | app/buyer-matching.tsx, lib/marketing.ts | Match saved searches to agent-owned published property pages — YES. DDF LATER. |
| #14 Automated Listing Emails | app/email-center.tsx | Consented-recipient preview and saved email drafts — YES. Actual delivery LATER. |
| #15 Lead Tracking & Analytics | app/lead-funnel.tsx, migration 016 | Existing property page / CRM / showing events — YES. Meta Insights LATER. |
| #16 Sales Funnel | app/lead-funnel.tsx | CRM and showing pipeline overview — YES. Automated attribution LATER. |
| #17 Office Marketing Dashboard | app/office-marketing-dashboard.tsx, migration 020 | Aggregated brokerage metrics and agent summaries — YES, admin only. |
| #18 Post-Sale Automation | app/post-sale-followups.tsx, app/marketing-automation.tsx, migration 020 | Agent Just Sold drafts and seller CRM tasks — YES. No emails/posting. |

Other included dependencies: agent-only Meta Connections, safe role navigation, styling, Social Studio types. DDF features remain untouched/on hold.

## Apply the code (GitHub)

1. Create a backup branch or download a ZIP of the existing GitHub repository.
2. **Extract** the ZIP. Upload the extracted files to their matching folders in `crmsocial` (`app/`, `lib/`, `supabase/`, `tests/`). DO NOT upload this ZIP file itself and DO NOT delete other files.
3. Commit on a test branch if available. Confirm `app/page.tsx` now annotates the saved calendar payload as `Omit<Draft,'_id'>` — this fixes the `scheduleStatus: string` Hostinger TypeScript error.
4. Deploy using Node 22 and `npm run build` (with `next build --webpack`). Confirm the build succeeds before switching production traffic.

## Apply Supabase database changes (in SQL Editor)

**Back up the production database first. Apply only migrations you have not already applied, in numeric order.** This ZIP includes:

- `016_marketing_showings_foundation.sql` — requires existing property/CRM tables.
- `017_marketing_full_suite.sql` — requires 016 + brokerage member tables.
- `018_meta_social_ads_connections.sql` — requires 016 + 017.
- `019_meta_ad_campaign_planner.sql` — requires 018.
- `020_marketing_office_and_post_sale.sql` — requires the above. Adds admin-only summary RPC and seller follow-up tasks.

If you previously ran 016–018, don't repeat them just to fix the build; instead, apply whichever of 019–020 are missing. The DDF migration 015 is NOT required for these modules.

## Navigation / smoke tests

- Agent: **Social Studio → Content Calendar, Meta Ads, Connections, Email & Alerts**, and **CRM → Meta Leads, Buyer Matching, Lead Funnel, Post-Sale Follow-Ups**.
- Brokerage admin: **Back Office → Brokerage Control → Office Meta Accounts / Office Lead Routing / Office Marketing Dashboard**.
- Agent users must NOT see Back Office or office-account connection screens.
- Try creating a Design Studio draft, planning it in the calendar, linking that design in Meta Ads, saving a budget, importing a small Meta leads CSV, previewing buyer matches, and creating follow-up tasks on a recorded Sold property.
- No action in this release buys Meta ads or sends mass emails. Do not treat the draft statuses as published content.

## Provider setup held for the final trial

1. DDF authorization: no imports, automated listing photos, or listing website approval yet.
2. Meta OAuth and App Review: no auto posting, live Meta ad creation, paid budgets, Insights, or lead-form webhooks yet.
3. Email (Gmail/Microsoft/Resend): no sending, inbox sync, unsubscribe processing, or automatic listing delivery yet.
4. Automated office lead assignment must run in a server-side worker after validating source and permissions; the current tool **previews** eligible rules only.

## Testing performed in this coding environment

- TypeScript/JSX **syntax/transpilation** checks for changed source files: PASS.
- 14 focused regression tests (calendar, budget, routing, permissions, draft safeguards): PASS, with Node `--experimental-strip-types`.
- Full Next.js production compilation / full original legacy test suite: **NOT VERIFIED** here; npm dependency installation failed in this environment. Hostinger's build and integration testing are required.

Never add your Meta access tokens, DDF passwords, email passwords or Supabase service-role key to client-side code, screenshots or GitHub. Brokerage access is enforced with RLS and admin-checked RPCs, not simply by hiding buttons.
