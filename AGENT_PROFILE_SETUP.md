# Connected agent profiles — RealVolt 0.7.1

## Install

Upload the complete source to GitHub, including next.config.mjs, app, scripts, package.json and package-lock.json. Keep your existing environment variables. Build with `npm run build` and publish output `out` (not `.next`). Node 22.13+ or 24 is required.

After migrations 001–012 are installed, run **supabase/013_agent_profile.sql** once in Supabase SQL Editor. It adds read-only brokerage-admin visibility of the brokerage's transaction files, including drafts. Existing reviewer assignments and write/approval restrictions remain in place. No new Edge Function deployment is needed for the profile or PDF worker fix. Existing SignVolt email/function setup is still needed for sending requests.

## Use

Back Office → Agents & profiles → click an agent name. Their accepted invitation links the profile's user ID to transactions automatically. Names can also be clicked in Back Office payments, production reports and transaction review rows. Agents who have not accepted their invitation have no account-linked work yet; name/email similarity does not merge accounts or past records.

The profile includes contact/plan information, transaction files and documents, confirmed earnings, deal deductions, monthly fees, authorized/paid cheques with itemized deductions, brokerage signing request status, and recorded office activity. Open a transaction to use its existing document and review interface. Only assigned reviewers can change review data; broader admin oversight is read-only. CRM contacts and personal reminders remain private. This update does not add a separate agent personnel-document vault.

Search and filter agents in Agents & profiles, Plans & monthly fees, Payments, transaction review queues and commission production reports. Profile date filters apply by section: earnings by completion date, monthly fees by billing month, payments by payment date (authorization date if unpaid), signing requests by creation date and activity by recorded date. Transaction filtering uses completion, listing or creation date in that order. Earnings exclude unapproved/future sales and missing allocations. Fees and payments are separate to prevent deducting a monthly fee twice. Current plan and all-time outstanding balance are explicitly labeled. Print / Save PDF uses the browser print dialog for the current profile section.

## SignVolt screenshot issue

The PDF worker previously loaded from `/vendor/pdfjs/pdf.worker.min.mjs`. The screenshot showed that the host could not import that file. The worker now ships through Webpack under a hashed `_next/static/media/pdf-worker.*.js` asset, which is included in the build output. Do not copy only app files or deploy an old build; upload the root Next configuration too. Font/CMap/decoder support assets are still prepared by the prebuild script.

The signer screen now explains why Next is disabled: missing signer name/email, PDF still loading, or the actual PDF error. Name/email columns stack at narrower workspace widths. Rebuild/redeploy and hard-refresh once to load the new bundle. Your PDF must render before placing signature fields.

## Verification

TypeScript and production static build passed. Existing 57 tests passed. An in-memory PostgreSQL check verified same-brokerage admin draft visibility, cross-brokerage exclusion and ordinary-agent privacy; the new policy permits SELECT only. The generated output contains a content-hashed PDF worker from the installed PDF.js version. Live Hostinger loading and live signing email delivery require verification after deployment.
