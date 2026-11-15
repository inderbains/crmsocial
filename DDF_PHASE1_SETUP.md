# RealVolt — DDF Listings Foundation (Phase 1, v0.9.1)

This update is **an additive implementation in the latest RealVolt green-theme source**. It does not replace your CRM, transactions, SignVolt, commissions or brokerage colours.

## What works after deploying
- **My Workspace → DDF & Listings** shortcut (also inside Social Studio). The sidebar shows **v0.9.1** when the current build is deployed.
- Social Studio → **DDF & Listings** navigation.
- Brokerage admins can **save/edit their office feed reference**; agents can **save/edit their own feed references**.
- Membership and brokerage roles are read from the existing `brokerage_members` table; changing the workspace label does not grant admin privileges.
- Feed references persist in Supabase with account-level and brokerage-level row-level security.
- Each feed remains **Pending approval** until a secure, server-side connection actually validates authorization. Merely entering someone else's ID does not give access to listings.
- A read-only listings inventory supports brokerage-wide admin views and per-agent views, including co-listing assignments.
- For listings imported by a future authorized worker with `marketing_authorized=true`, agents/admins can generate a **private property page draft** using authorized data. Existing manual Property Pages continue working.

## Install
1. Back up your existing repository and Supabase project.
2. Unzip this package into the same GitHub repository root; upload all changed/new files (not the ZIP itself).
3. Verify that migrations 002, 005 and 009 and any intervening migrations used by your existing app are already installed.
4. In your **existing** Supabase project SQL Editor, run only `supabase/015_ddf_listing_foundation.sql` from this update. It is additive; do not rerun earlier schema scripts.
5. Redeploy your existing Hostinger/GitHub build using Node 22+ with output directory `out` (static export). Keep existing public Supabase environment variables.
6. Sign in as a brokerage admin. Go to **My Workspace → DDF & Listings** → All Office Listings → enter the authorized feed reference and save. The status is **Pending approval**, not Connected.
7. Sign in as an invited/active agent attached to the same brokerage and add their My Listings reference. Verify neither account can edit the other's connection.

## CREA onboarding, not yet implemented
- RealVolt must be approved as an authorized CREA DDF Technology Provider and the brokerage/agent must explicitly authorize their feed as a destination.
- A secure server process must hold provider credentials, validate the destination, call CREA's permitted API and periodically sync data with proper status/media/attribution rules. **No CREA requests, tokens, syncing or automatic publishing are implemented in this phase.**
- The existing static Hostinger app cannot perform scheduled server jobs. Use Supabase Edge Functions + an approved scheduler or a separate managed worker; the browser should never know or receive the provider API secret.
- Do not enable `marketing_authorized` in the inventory without documented provider authorization. The server should revoke or take down DDF-sourced pages when permissions expire.
- Keep each office/agent feed mapped to its verified `brokerage_id` and user ID. The listing table is server-write-only and does not grant public listing inventory access.

## Important limits
- DDF Destination IDs and agent member IDs are **non-secret reference values** only. Never paste an API key, password, bearer token or OAuth token.
- DDF data, media and social ad usage are subject to CREA rights and required attribution. Feed approval must precede publishing; feed references do not grant rights to use third-party images.
- Legacy manual property pages use `/property/?id=...`; wildcard custom property subdomains require dynamic routing hosting and DNS that the current `output:'export'` setup cannot provide. Do not enable or advertise automatic subdomains on current Hostinger static hosting.
- The original property page editor still limits uploads to 8 compressed photos. This phase introduces schema capacity for remote listing media but does not change legacy manual uploads.
- Public property page/showing request integration, Meta OAuth/autoposting/ads, email matching and analytics are separate implementation phases. No user credentials or paid ad accounts were accessed.

## Test checklist
- Verify admin can create/edit only own brokerage office feed.
- Verify agent cannot create or update an office feed (including forged browser API requests).
- Verify agent's saved feed is not editable by a different agent.
- Verify status cannot be forged to Authorized via browser API and agent cannot inject DDF listings.
- Verify Brokerage B cannot see Brokerage A feed or listings; signed-out users see neither.
- Verify property pages and brand colours continue working as before.
- TypeScript syntax/transpilation of the new components passed. Full `npm ci`/`npm run build` and the existing test suite could not run in this environment because npm dependencies were unavailable; run both in GitHub CI or your own development machine. Test the SQL migration against a staging copy before production; this environment has not executed it in your Supabase project.

## If nothing appears after uploading
1. Open RealVolt and check if **v0.9.1** appears beside the RealVolt logo in the left sidebar. If not, the new source code has NOT reached your hosted site: you must extract the ZIP, commit all files to the deployed GitHub branch, and wait for a successful host build/redeploy. Uploading the ZIP file itself is not deployment.
2. After signing in, click **My Workspace → DDF & Listings** (a new card near Social Studio), or use the DDF & Listings item directly in the My Workspace sidebar.
3. If the page says **Brokerage membership required**, add/verify your membership through Back Office. If the page says **Run supabase/015_ddf_listing_foundation.sql**, run that migration in your existing Supabase project.
4. Even after setup, listing inventory will show empty until CREA approves the connection and a secure backend listing-sync worker is installed. A saved Destination ID alone does NOT import listings.
5. If the site is completely blank, check your deployment build logs and browser console; confirm Supabase public environment variables exist and that the deployed root folder contains package.json and app/.
