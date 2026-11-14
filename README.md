# RealVolt Social Studio

Next.js App Router + React + TypeScript + Supabase. Builds with Node.js into static HTML/CSS/JS for regular Hostinger shared hosting.

## Included
- Responsive social dashboard, eight curated templates, reusable canvas previews and matching PNG exports.
- Headline, caption, photo and channel editor; user-owned cloud drafts; content planning calendar.
- Brand kit with name, website and colour.
- Email/password signup, sign-in, confirmation redirect, reset-password flow and sign-out.
- Supabase SQL with Row Level Security for account separation.
- Facebook/Instagram/LinkedIn connection setup screens. Actual provider OAuth and publishing are NOT implemented.
- CRM and transactions are future modules.

## First: Supabase
1. Create a new Supabase project. In SQL Editor run `supabase/schema.sql` once.
2. If you already ran the SAME schema from the previous HTML starter in this project, skip this step: both versions use the same tables. Do not rerun the create-table script over an existing database.
3. Enable Email authentication. Keep confirmation enabled and configure SMTP for real users.
4. In Auth URL Configuration set Site URL to your final HTTPS Hostinger app URL and allow the exact URL as an additional redirect (including trailing slash/subfolder).
5. Copy your project URL and PUBLIC publishable key. Never expose a secret/service_role key.

## Local development
Use Node.js 22 or newer.
```bash
npm ci
cp .env.example .env.local
# Edit .env.local with your Supabase URL and public publishable key.
npm run dev
```
Open http://localhost:3000. Add this local URL to Supabase's redirect allowlist if testing confirmation/recovery locally.

## Create your GitHub project
Create an empty private repository named `realvolt-social`. Extract this ZIP and upload ALL source files to the repository root, including `.github/workflows/build.yml`, `.gitignore` and `.env.example`. Do not upload node_modules, .env.local, .next or out.

Alternatively, from this extracted directory:
```bash
git init
git add .
git commit -m "Start RealVolt social workspace"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/realvolt-social.git
git push -u origin main
```
Replace the example remote with your actual new repository URL. No repository has been created or pushed on your behalf.

## Build on GitHub
Under repository Settings > Secrets and variables > Actions > Variables, create:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- NEXT_PUBLIC_BASE_PATH (optional; empty for a domain/subdomain root, `/social` for a subfolder)

These values are intentionally public browser configuration. Database policies protect records. Do NOT use the Supabase secret key.

Push to main or run Actions > Build Hostinger website > Run workflow. Download the `hostinger-website` artifact from the successful run. It contains the exported website: index.html, _next and other generated assets.

IMPORTANT: changing variables requires a NEW build. The public configuration is embedded at build time.

## Deploy to your connected Hostinger account
Regular shared hosting serves the exported files; it does NOT run `next start` or build this source repository automatically.

Recommended first deployment:
1. Use a separate domain/subdomain directory. Back up any existing website first.
2. Build via GitHub Actions as above.
3. Extract the CONTENTS of the downloaded artifact into the target Hostinger public_html directory. The index.html and _next folder must be directly inside that web root.
4. Use HTTPS and test the final URL. Set the same final URL in Supabase Auth settings.

A GitHub-to-Hostinger connection that only pulls the SOURCE will not deploy this Next.js app correctly. It must receive the BUILD OUTPUT. This package includes build-artifact generation, not automatic remote upload. If your Hostinger connection requires a deployment branch or a specific folder, use that mechanism to deploy the contents of out/ only. Do not point the live web root at source files or publish .env.local.

Local build alternative:
```bash
npm run typecheck
npm run build
```
Upload everything INSIDE out/ to the web root. There is no persistent Node process on shared hosting. No PHP/MySQL is needed.

## How to verify your installation
- Create Account A, confirm email, sign in. Save a draft, upload photo, save brand, choose planned date, export PNG.
- Reload and check saved records.
- Sign out and sign in as Account B; A's drafts/brand must not appear.
- Confirm signed-out database reads are denied. Test isolation through authenticated requests as well as UI.
- Test confirmation and password recovery on the FINAL domain.
- Test mobile layout, calendar navigation, image uploads and PNG downloads.

## Boundaries and next steps
- Dates are local planning strings, not scheduled publishing jobs.
- Photos are resized and stored in JSON for this small starter. Migrate to private Supabase Storage with user-scoped policies and signed URLs before scaling.
- Sample photos load from Unsplash and fonts from Google Fonts. Use licensed listing photos for real marketing.
- Next phase: Supabase Edge Functions for Meta/LinkedIn OAuth callbacks, encrypted server-side token handling, permissions review and scheduled publishing. Never store provider tokens in browser code or public user-readable tables.
- This is an initial source project, not a completed brokerage SaaS. No team roles, MLS/DDF ingestion, analytics, real ad buying or transaction processing yet.
- Live Supabase Auth, SQL execution, account-isolation and real hosting checks require your project configuration and were not performed in this environment.

## Reference
https://nextjs.org/docs/app/guides/static-exports
https://supabase.com/docs/guides/getting-started/api-keys
https://supabase.com/docs/reference/javascript/auth-signinwithpassword
