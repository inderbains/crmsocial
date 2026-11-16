# RealVolt v1.1.0 — Meta Social Connections + Meta Ads Accounts

This is an **add-on to your existing RealVolt v1.0.1** (do not remove the CRM, transactions, DDF, property pages, or back-office modules). **DDF stays on hold.**

## Delivered now

- **Social Studio → Connections:** Agent Meta connection screen with Facebook Page, Instagram professional account and **paid Meta Ad Account** discovery.
- **Back Office → Office Meta Accounts:** Brokerage admins can independently authorize and manage an office's Meta connections. Agents cannot use another brokerage's private connection.
- One server-only Meta OAuth integration (`meta-connect`) for business asset discovery and token handling. No agent enters passwords or API keys in the frontend.
- Account overview with default Page, Instagram account and Ad Account selection, disconnect, and permission status.
- **Meta Ads Manager:** Each campaign draft can select a *verified* Meta Ad Account, Facebook Page and Instagram identity. Drafts are marked **HOUSING**. A campaign can only be marked ready for review with an authorized Ad Account and `ads_management` scope.
- The database validates selected assets so one agent cannot attach another user's or another brokerage's Meta accounts to their campaigns.
- Everything keeps the existing green RealVolt interface and other modules.

## Safety limits / what's NOT live yet

- **No campaign creation on Meta, charges, actual targeting, scheduled posting, automatic Just Listed/Just Sold publishing, or live Lead Ads webhooks.** Your existing campaign *planner* and CSV lead importer continue to work as before.
- The Meta connect button will report an expected setup error until the Edge Function is deployed and configured. The UI **never** claims that Meta is connected unless verified asset records exist.
- Media rights, Meta Housing Special Ad Category restrictions and brokerage/agent authorization must be handled before actual publication.
- Future paid ads should be created **paused initially**, with an explicit agent approval and authorized Ad Account, as a separate release.

## Upgrade now (no provider credentials required)

1. **Back up or tag your last working GitHub commit** in `inderbains/crmsocial`.
2. **Extract the ZIP** and upload ONLY these changed or new source files into their matching GitHub directories (GitHub's drag/drop uploader accepts fewer than 100 per batch):
   - `app/page.tsx` — updated navigation and new Connection screen
   - `app/meta-ads.tsx` — links campaign drafts to verified Meta assets
   - `app/meta-connections.tsx` — new agent and brokerage connections UI
   - `supabase/018_meta_social_ads_connections.sql` — database migration
   - `supabase/functions/meta-connect/index.ts` — provider OAuth / discovery Edge Function; stored for later deployment
   - `REALVOLT_META_SOCIAL_ADS_SETUP.md` — these instructions
   - `supabase/config_meta_snippet.toml` — notes for function config; don't overwrite `config.toml`
3. In Supabase **SQL Editor**, after migrations **016 and 017**, execute `supabase/018_meta_social_ads_connections.sql` once. **Do not run schema.sql or delete/recreate tables.** The migration is additive.
4. Commit changes and confirm Hostinger succeeds with `npm run build`. The code has passed TypeScript syntax parsing here; a full Next.js build against your deployment has not been run.
5. Visit **Social Studio → Connections**, **Social Studio → Meta Ads**, and **Back Office → Office Meta Accounts** (only for brokerage admins).

If migration 018 has not run, Connection / Ad Account settings will show a setup warning. Existing CRM and other features are unchanged.

## Final integration/testing round (later, together)

1. Register/configure a Meta developer application for RealVolt (Business Login and Marketing API); request the needed business permissions and App Review. Meta provides ads and page/Instagram scopes separately.
2. Set the exact Meta OAuth redirect URI to **`https://YOUR_SUPABASE_PROJECT.supabase.co/functions/v1/meta-connect`** in the Meta app; configure your deployed site's domain and Privacy Policy / Terms.
3. Deploy the function (Supabase CLI recommended): `supabase functions deploy meta-connect --no-verify-jwt` and add the following to **existing** `supabase/config.toml`:
   ```toml
   [functions.meta-connect]
   verify_jwt = false
   ```
   The function verifies the RealVolt JWT itself on POST; its OAuth callback GET must remain accessible without a JWT.
4. Set these **Supabase Edge Function secrets** (never `NEXT_PUBLIC_`, never GitHub): `META_APP_ID`, `META_APP_SECRET`, `APP_URL` (exact published website URL), optionally `META_GRAPH_VERSION` (default `v27.0`). Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically in a normal Supabase Edge Function environment.
5. Sign in as an agent to connect personal Pages / Instagram / Ad Accounts. Sign in as a brokerage admin to connect office Meta assets separately. Verify no other agent can see or use those assets.
6. Authorize and validate **actual ad campaign creation, opt-in approval, spend limits, Housing category, Lead Ads webhooks, scheduled content, and click/CRM tracking** in a later integration/testing release.

**Security:** The `rv_meta_secret_tokens`, `rv_meta_page_tokens`, and `rv_meta_oauth_states` tables have RLS and no authenticated/anonymous access. Tokens are never returned to the browser. Production hardening should add token rotation/revocation auditing, encrypted secret vault usage, rate limiting, reconciliation and monitoring before scaling to thousands of users.

## Testing results for this package

- Updated TSX and Edge Function files: TypeScript parser checks passed.
- SQL: reviewed statically; **not executed** against your live Supabase database.
- Meta OAuth and API calls: **not exercised** (no user authorization or configured Meta app).
- Full Next.js build: **not run here** due unavailable npm dependencies in this environment. Verify Hostinger build before considering the release deployed.
