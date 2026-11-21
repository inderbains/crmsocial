# RealVolt — Transaction lifecycle upgrade (migration 034)

**Staging release candidate.** Prepared against the available `RealVolt_Full_Project_Corrected.zip`, `crmsocial-main (3).zip`, latest standalone leaderboard and Steps 3/4/5 patches, and the last distributed Gmail invitation function. No connection to the live repository or database was available. Do not deploy directly to production without reviewing and testing on a staging clone. This patch does not send any real email or release funds by itself.

## 1. Before uploading

Back up your GitHub branch and Supabase database. Use a staging Supabase project with test accounts/documents and a staging Hostinger deployment. Do not run 034 twice; it is a one-time transactional migration. Confirm prior migrations, including 006, 007, 009, 010, 011 and 033, are installed. IMPORTANT: unclassified legacy deals are not inferred to be firm just from planned dates. Existing deals, files, payments and memberships are retained; legacy sales require review and explicit firm confirmation. Existing pending authorized payouts should be reconciled before rollout because the new gate requires actual completion, letter and funds verification before payment. No tenant transfer is performed.

## 2. Database — run first, on staging

In Supabase SQL Editor, open `supabase/034_transaction_lifecycle.sql`, paste the whole file, run once. It is wrapped in BEGIN/COMMIT. Inspect any error; if one occurs do not apply the application files until resolved. Keep this migration in GitHub under `supabase/`. Read-back verification:

```sql
select to_regclass('public.rv_tx_summary') is not null as summary_ready,
       to_regclass('public.rv_transaction_notifications') is not null as notifications_ready,
       to_regprocedure('public.rv_tx_action(uuid,text,date,uuid,text)') is not null as lifecycle_ready,
       to_regprocedure('public.rv_brokerage_sales_leaderboard(text,text)') is not null as leaderboard_ready;
```

Do not manually alter memberships, disable RLS, or delete old files.

## 3. GitHub / Hostinger

Upload the supplied `app/`, `lib/`, `supabase/` files to their matching paths in the latest source. Review each replacement against your latest GitHub version. **Do not blindly overwrite app/realvolt-workspace.tsx**: it is a merged example based on Steps 3/4/5 and standalone Leaderboard. The safer option is to leave the existing workspace file in place and run `node scripts/merge-transaction-navigation.mjs --dry-run` followed by `node scripts/merge-transaction-navigation.mjs` in your latest local clone. This only updates navigation and adds archive/notification links. If you use GitHub's browser editor, compare your latest workspace with the supplied merged example and merge those specific changes. Existing workspace-home.tsx and leaderboard CSS remain unchanged. Keep newer unrelated CRM, AI, Social Studio, Agent Website and automation edits. Do not replace your entire repository.

Run `npm run typecheck` and `npm run build` in the actual current project. Then deploy staging. The full production build was not run here because current dependency installation and live project access were unavailable.

## 4. Edge Functions (Supabase)

- `closing-packet`: deploy the canonical `supabase/functions/closing-packet` folder with `_shared` files via Supabase CLI, or create/deploy a function named `closing-packet` in Supabase's browser editor using **edge-editor/closing-packet.ts** (single file, complete imports). Keep authentication verification enabled. Use this before testing Generate and preview PDFs. If the function exists, replace its code after backing up. PDF generation needs no sending provider. If the same error persists, inspect Function logs, invocation URL and authentication; deployment itself has not been verified here.
- `agent-office`: deploy the updated repository function or use **edge-editor/agent-office.ts** in the editor. Existing Gmail invitation settings and onboarding redirect are preserved. New invitations are blocked when the email already belongs to any brokerage membership. An approved transfer workflow is not included; no existing account is moved.
- Emails: keep actual sending unconfigured/disabled during tests. CIR/letter templates, recipient-specific attachment review and Send functionality are present. The existing closing provider is Resend (`RESEND_API_KEY`, verified `CLOSING_FROM_EMAIL`, brokerage reply-to email); it is separate from Gmail used for invitations. Connect a real conveyancing sender later. Do not send before selecting verified, relevant attachments and reviewing the recipient. Internal compensation and identity documents must not be sent. Name-based checks are only a secondary guard: staff must classify and select only appropriate documents.

## 5. End-to-end test sequence

1. Invite a new unique-email agent. Try the same existing member email from a second brokerage: it should be rejected, not switch membership. Test with two accounts; confirm no cross-tenant records can be read or acted on.
2. Add listing: address, PID, legal description, seller, price, listing date, expiry. No lawyer or sale dates. Save, attach signed listing contract, submit. Admin dashboard shows a new file. Admin opens; agent receives a viewed notification. Verify required documents and approve. Check both dashboards and the listing's status.
3. From approved listing choose Accepted offer / create sale. Existing property/seller details are carried forward; separate SLE ID links to original LST record. Original listing documents remain with original listing. Sale docs are uploaded separately; add buyer and cooperating brokerage/agent, contract and subject dates, commission and deposit holder. Submit and approve the accepted contract. Verify subject reminder, and check leaderboard remains unchanged.
4. Buyer-side: + Add sale, both buyer/seller names, cooperating listing brokerage. No listing or expiry date. Submit independently. Either side may choose our or other brokerage deposit holder. Check both trust calculations for a test deal.
5. For an approved accepted sale, Extend subjects: upload signed PDF, select it and revised date; submit. Check new reminder and document verification. Verify no duplicate leaderboard sale. For firm status edit sale details and both lawyer contacts, save, upload signed subject removal PDF (or unconditional contract), then choose Remove subjects / mark firm sold and actual firm date. It becomes Sold with red border and submitted for Back Office approval. Leaderboard counts the firm sale immediately, using actual firm date (monthly/yearly Vancouver time); refresh or wait for polling. Completion replaces subject date on agent dashboard. Confirm count is not doubled on completion.
6. Admin verifies subject removal and sale docs; approve. Generate CIR and letter PDFs, download and examine. Confirm only gross external brokerage commission and applicable GST are disclosed, not internal agent split or fees. Select verified relevant documents separately for buyer and seller; do not send during tests. For our trust deposit, proposed own-side retention and remaining balance are planning figures only; confirm all other brokerage entitlements and authorized releases manually before posting actual entries. External deposits never appear as our trust cash.
7. Once legal completion actually happens, admin uploads lawyer completion letter, selects Confirm legal completion and actual date. Use Request missing documents action if required. Agent uploads missing files; admin verifies them. Legal completion is independent of document closure. Verify cleared commission receipt reference; no financial entry or payout is posted by that button.
8. Back Office → Agent payments: select completed file with verified funds; authorize payout with deductions. It uses current agent profile split, agent GST registration/rate, and eligible outstanding cheque-deducted monthly fees, reserving each bill only once. Verify agent statement in test data. Actual payout is separately authorized and recorded via existing cheque/EFT routes. Confirm accounting reports and bank reconciliation; never print/send an actual cheque in staging. Close/archive only after paid and requirements verified.
9. Test termination signed PDF and Back Office approval; expiry after Vancouver date should appear in Archive/Expired listings automatically (derived, no scheduler or physical file moves). Test an offer collapse before firm, signed supporting PDF; historical records retained. Test mobile, theme colours, navigation, CRM and SignVolt regression.

## Known limitations / final verification needed

- This is an implementation candidate, not a validated production deployment. Ten targeted JS calculation/routing/static SQL tests passed; TypeScript syntax transpilation passed. No live SQL migration, full Next build, Edge deployment, email delivery, or database concurrency/RLS integration test was run.
- Historical firm sales without a recorded actual firm date/PDF must be reviewed; no fabricated historical leaderboard entries. Reversal of a firm sale, brokerage transfer, joint production credits and correction of already paid transactions require controlled workflows beyond this patch.
- Listing expiry/archive is status-based, not a scheduled background job. Notifications and leaderboard refresh about every 15 seconds while viewing; no email/push reminders or 30/7/1 day scheduled expiry messages yet. Archive finalization is a deliberate admin action. Lawyer match fixes use name/firm; cooperating brokerage/Realtor fields are entered manually in this release. Full reusable brokerage/Realtor directory, configurable not-applicable requirement reasons, and migrated historical accounting records need further work.
- Current allocation uses the agent's current profile; review the effective compensation agreement and any prior recorded deductions before authorizing, and never duplicate monthly fees as manual charges. No automatic trust disbursement is implemented. The existing trust ledger/cheque workflow is retained for authorized accounting actions.

## Local targeted tests

`node --test tests/transaction-lifecycle-upgrade.test.mjs`

Existing tests expecting old behavior (all sales treated as sold, old completion-only reporting) should be updated against the new status model before production; review other regression tests as part of staging.
