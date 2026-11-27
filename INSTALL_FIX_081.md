# RealVolt Fix 081 — Agent invitation & password activation

Prepared against `crmsocial-main (9).zip`, with Fix 080 identified as a separate personal-dates-only patch. This is a targeted patch, not a replacement project or a live deployment. Keep all other installed fixes. The live branch and Supabase configuration were not accessible for verification.

## What changes

The agent invitation email now opens `/accept-invitation/` on the deployed application rather than the public homepage. The recipient deliberately clicks Continue to exchange the one-time email token (a plain page visit or email scanner does not redeem it). After verification the agent sees their actual brokerage name, locked email, full name, optional phone/licence, password and confirmation, and existing fee/commission terms. On acceptance, the password is saved through Supabase Auth and the database transaction links the verified account to the exact invited brokerage as an agent, activates the existing `office_agents` row, assigns the existing reviewer, and records acceptance. The browser session is switched only after acceptance; the agent can then open the dashboard. No duplicate agent profile is created. An existing brokerage member is rejected, never transferred. Passwords are not stored in RealVolt application tables. The new flow requires at least 12 characters. Existing Gmail/Resend invitation sending and Stripe actions are retained.

## Installation (staging first)

1. Back up current GitHub branch, live `agent-office` Edge Function source and database. Confirm the existing brokerage and agent-management migrations (005, 009) are installed. Do not rerun them.
2. Supabase → SQL Editor → New query: paste and run all of `supabase/081_agent_invitation_activation.sql` once. It creates two new authenticated RPCs and hardens the existing acceptance RPC. It does not change existing agent memberships or profile rows during installation. Keep RLS enabled.
3. Upload the following **new** files to your current GitHub project, preserving folders:
   - `app/accept-invitation/page.tsx`
   - `app/accept-invitation/activation.module.css`
   - `supabase/081_agent_invitation_activation.sql`
   - `tests/invitation-081.test.mjs` (optional focused checks)
4. Merge the updated `supabase/functions/agent-office/index.ts` into your current repository. The original Version 9 function SHA-256 is `3fee68525b2425ac7c2e6a9f419079950f3b814a8a3b1d74b9f887d8a43c24c0`. If the current function differs, compare and merge only the invitation URL and email text changes rather than blindly replacing other improvements. The new code retains the existing membership check and provider settings. Run `npm run typecheck`, `npm run build`, and `node --test tests/invitation-081.test.mjs`. Deploy the Next.js website and confirm `/accept-invitation/` displays an invitation-unavailable message when opened without a token (not the homepage or a 404).
5. Supabase → Edge Functions → Secrets: confirm `APP_URL` is the actual deployed HTTPS application base URL, e.g. `https://realvolt.ca` **only if that is the active deployment**. Do not add `/workspace/`, a query string or a hash. If using a configured base path, include that base path. Preserve existing Gmail/Resend and Stripe secrets. Never paste secrets in chat or GitHub.
6. Supabase → Authentication → URL Configuration: verify Site URL is the real application base; add the actual HTTPS `/accept-invitation/` path to Redirect URLs. This custom link verifies via `verifyOtp` directly, rather than relying on Supabase's default redirect; keeping the allow-list accurate also protects other auth flows.
7. Deploy the updated `agent-office` function separately in Supabase (GitHub deployment alone does not update it). Either use the Edge Function editor with the full merged `index.ts` or run `supabase functions deploy agent-office` from the linked current repository. Retain current JWT verification and all existing provider secrets.
8. Resend a fresh invitation from the existing agent management screen. Old emails do not change. The email should contain a URL with `/accept-invitation/?invite=...#token_hash=...`. Treat the full URL as a password-equivalent secret; never share it in screenshots/logs. The Supabase token expires according to Auth settings (which may be shorter than the 14-day office invitation). If the activation page is refreshed after verification or a token is consumed/expired, request a new invitation. If the password was saved but acceptance failed, membership remains unchanged; retry within the page or request a fresh invite.

## Test before production

- Send a fresh invitation to an unused test email. Open in an incognito window; confirm correct brokerage name and locked email after Continue. Set a password and accept. Check `office_agents.status='Active'`, `accepted_at`, `user_id`, and matching `brokerage_members.brokerage_id` with role `agent`. Sign out and sign in with email/password; verify agent workspace and brokerage isolation.
- Do not accept: confirm no membership is granted. Check invalid/expired links, a mismatched invitation UUID, repeated link, already-member email (both same and different brokerage), and concurrent acceptance attempts. Confirm no cross-brokerage assignment, duplicate profile or admin privileges.
- Change fee terms before acceptance and verify that the user must review the updated terms. Test wrong password confirmation. Test Gmail or Resend and existing payment action regression.
- Test the link from a browser with a different logged-in account, preferably incognito; confirm the invitation uses the verified email rather than that other session.
- Confirm delivery of the custom URL including the fragment with the actual mail provider and client; if a mail security product strips fragments, the page must reject the incomplete link and the administrator must issue a fresh link through a supported channel.

## Validation and limitations

Four focused source-level tests passed and both changed TS/TSX files passed syntax transpilation. Full Next.js type checking/build, PostgreSQL migration execution, actual email delivery, Supabase Auth, and live tenant isolation have **not** been verified here. Perform those staging checks before using real agents. Existing accounts with a brokerage membership are deliberately blocked; an approved transfer flow is out of scope. Existing pending legacy links should be replaced by newly sent invitations. This patch does not modify transaction screens, CRM, trust, dashboard, social studio, or DCIR email functionality.
