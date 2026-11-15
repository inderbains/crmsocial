# RealVolt v1.0.0 — Combined Marketing, CRM & Automation Update

This is one **changed-files-only update** for your existing RealVolt v0.9.2 project. It preserves your green theme, DDF screens, CRM, Transactions, SignVolt, Back Office, and existing records. Do **not** delete the rest of your repository.

## Included and usable after migrations 016 + 017

| Location in RealVolt | Feature | What's working |
|---|---|---|
| Property Pages | Manual property websites | Photos, agent information, shareable `/property/?id=...` link, optional authorized video/virtual tour/floor plan URLs, public showing-request form |
| CRM → Showing requests | Showing inbox | New requests create or match agent CRM contacts and a high-priority task. Agent may update status and private notes. Confirmations remain manual. |
| CRM → Buyer Matching | Buyer saved searches | Area, maximum budget, minimum bedrooms; compares with the agent's own active published pages. **No emails sent**. |
| CRM → Meta Leads | Meta CSV lead import | Import up to 500 leads per CSV, deduplicate known emails, source tag, area/budget, preserve Unknown consent, recent imports list. |
| CRM → Lead Funnel | Engagement metrics | Page views, contact clicks, showing requests and existing contact stages. Counts are aggregate estimates. |
| Social Studio → Design Studio | Designs | Just Listed, Just Sold, Open House, Price Reduction, Buyer Leads, Seller Leads and other templates. Agent/brokerage brand kit and image export. |
| Social Studio → Automations | Automatic social **drafts** | One Just Listed draft on first publication, one Just Sold draft on verified sold status; configurable per agent. Does **not** publish. |
| Social Studio → Content Calendar | Manual scheduling **plan** | Edit dates, captions, drafts. No backend publishing scheduler yet. |
| Social Studio → Meta Ads | Meta Ads campaign planner | Campaign types, property selection, ad captions, price/budget plan, draft/review status. **No paid campaigns are created.** |
| Social Studio → Email & Alerts | Email configuration/drafts | Stores preferred sender display only (never passwords), prepares email draft campaigns, previews consented recipients matching saved searches. **No emails sent.** |
| Back Office → Office Lead Routing | Brokerage routing rules | Admin can save agent areas, price bands and max open-lead capacity. Actual transfer across agents awaits secure backend. |
| Agent / Back Office DDF screens | DDF authorization placeholders | Existing v0.9.2 role-separated connection screens unchanged. CREA provider access on hold. |

## What is NOT live yet

* CREA DDF import, automatic property-page subdomains and DDF status changes — requires CREA approvals and infrastructure; existing website DDF credentials must **not** be pasted here.
* Facebook/Instagram OAuth connection, automatic posting, scheduling execution, Meta Ads billing/campaign creation, live Lead Ads webhook imports, and Meta performance statistics — requires an approved Meta developer app, appropriate permissions and a server-side worker.
* Gmail/Microsoft 365/other-mailbox OAuth, inbox synchronization, automated buyer listing email alerts, email click identity and unsubscribe processing — requires verified email providers and an actual server-side messaging system. Marketing consent must be checked (CASL).
* Cross-agent CRM ownership transfer for brokerage leads — requires a secure server service, authorization and audit trail. The current UI saves routing **rules** only.
* Bot protection and server-side rate limits for public forms and public analytics — required before large-scale production deployment.

## Safe installation in your existing GitHub repository

1. **Back up your current repository first** (Download ZIP from GitHub or create a branch). This is based on your RealVolt Green Theme / v0.9.2 code. If you edited the same files after that, compare before replacing.
2. Download and extract the patch ZIP. It contains only files to **add or replace**. Preserve its `app/`, `lib/`, `supabase/`, `tests/` folder paths. **Do not upload the ZIP itself to GitHub.**
3. Recommended: use **GitHub Desktop**. Clone `crmsocial`, copy the extracted patch files into the matching folders in the local repo (allow replacement), inspect the Changed files list, then Commit and Push. This avoids GitHub browser upload problems and ensures no unrelated files are removed.
4. In your **existing Supabase SQL Editor**, run `supabase/016_marketing_showings_foundation.sql` **first**, and `supabase/017_marketing_full_suite.sql` **second**. The earlier migrations 002 (properties), 003 (CRM), 009 (office agents) must already have been applied. Use your existing Supabase project, not a new one. **Make a database backup before migrations.**
5. Check Hostinger's build logs and wait for a successful deployment. Ensure the environment already has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The static-export hosting model is unchanged.
6. Sign in. In CRM, open **Showing requests**, **Buyer Matching**, **Meta Leads**, **Lead Funnel**. In Social Studio open **Automations**, **Meta Ads**, **Email & Alerts**, **Property Pages**, and the existing **Content Calendar**. For brokerage admins open **Back Office → Office Lead Routing**.
7. Create a **test** property page, add a photo, publish it, open the public URL in a private window, submit a showing request, verify that it reaches CRM and creates a task. Check Social Studio → Drafts for a Just Listed draft. Edit the property to `Sold` (only for this demo property) and check for a single Just Sold draft.

## Production notes

* No custom subdomain is created by this version. Pages use the working path-based URL. DNS, wildcard host routing and per-tenant SSL need a separately configured hosting setup.
* The current property editor stores optimized images inside `property_pages.payload` as Base64. Before scaling to 1,000 agents, move images to object storage/CDN (e.g. Supabase Storage) and keep URLs in the database; load-test the application.
* The public showing request SQL RPC uses input validation and a honeypot, but is not a full anti-abuse system. Add provider-level captcha/edge rate limits before sending large amounts of advertising traffic to property links.
* Use only licensed listing media. Do not publish sale prices or statuses without verification. Follow Meta housing-ad policies and applicable privacy/CASL requirements.
* All new database tables use owner-isolated or brokerage-admin RLS rules. Do not use service-role keys in client-side code.

## Test results in the build environment

* 48 TypeScript/TSX files syntax parsed successfully (no syntax diagnostics).
* 14 focused existing/new tests passed (CSV, listing logic, buyer match, Meta lead CSV).
* **Full Next.js production build NOT verified**: this environment did not successfully install npm dependencies. Existing SignVolt/PDF tests were also blocked by missing packages here. Run `npm ci && npm run typecheck && npm test && npm run build` on your configured machine or CI, and review errors before publishing. No Supabase migration was executed against your database by this package.

## Phase 2 connector work after credentials/approvals

1. CREA Technology Provider registration and authorized agent/office feeds.
2. Server-side Meta OAuth + Page/Instagram connection, deduplicated new/sold publishing jobs, Ads API, Lead Ads webhooks, housing category validation.
3. Google/Microsoft OAuth and transactional provider, two-way inbox, buyer email schedules, tracked recipient links with privacy controls, unsubscribe and consent.
4. Brokerage lead-assignment worker with signed webhooks, auditable routing and authorized RLS-safe writes.
5. Image CDN, queue/worker architecture, production monitoring, load tests, custom property domains.
