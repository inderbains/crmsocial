# RealVolt Fix 084 — Platform owner and monitoring dashboard

Prepared against the available Version 9 repository. Additive patch; does not overwrite existing modules, invitation fixes, roles, CRM, or transaction workflows. No live access or production build was available. Test in staging first.

## Install
1. Back up your current GitHub source and Supabase database. Keep Fix 081–083 changes intact. This migration does not repair them or certify isolation.
2. In the correct Supabase project, confirm Authentication > Users contains the existing verified owner `inderbains@gmail.com`. Do not create another identity for this address. If TOTP MFA is not enabled, enable the project's TOTP enrollment/verification settings. Prefer enrolling the owner using a trusted environment before public launch. The first enrollment relies on possession of the owner's password; secure that password and email before enabling access.
3. Run the complete `supabase/084_platform_admin.sql` in Supabase SQL Editor. It stops and rolls back if the exact verified owner cannot be located or a different platform owner already exists. The last query returns the configured owner. The private schema should NOT be added to exposed API schemas.
4. Run `supabase/VERIFY_084_READ_ONLY.sql`. Expect one owner and four false permission checks.
5. Upload ONLY `app/admin/page.tsx` and `app/admin/platform.module.css` to the same paths in your current GitHub repository. Do not replace the workspace or homepage. If an `/admin/` page already exists, stop and merge rather than overwrite. Run `npm run typecheck` and `npm run build` in the real repository. Deploy after successful staging tests.
6. Open the current deployed RealVolt URL with `/admin/` appended (use realvolt.ca only if it is the deployed app domain). Sign in with `inderbains@gmail.com` and its existing Supabase Auth password. If a verified authenticator factor exists, enter its code. Otherwise add the displayed setup key to a TOTP authenticator app and verify with a fresh code. Do not share the setup key or password. An incomplete MFA enrollment may need cleanup through authorized Supabase support/admin controls. The separate dashboard session is memory-only; a page refresh requires sign-in again.
7. Check the dashboard and sign out. It displays recent successful sign-ins in the last 24 hours, not a live online presence metric. Refresh manually for new totals.

## Mandatory staging tests
- An anonymous user has no access to the overview RPC; a regular agent and a brokerage admin (including with MFA) receive permission denied. Test direct API calls, not only the UI.
- The platform owner without a verified AAL2 token receives permission denied from the overview. After TOTP verification, the owner sees only the specified directory fields, aggregate totals, and platform dashboard read audit records. No contact details, transaction contents, file downloads, or customer credentials are returned.
- While signed in to an unrelated workspace account, open `/admin/`. It must ask for separate credentials and not reuse that session. Signing out of `/admin/` must not sign out of the normal workspace. Test reload and expired sessions.
- Compare account totals to Auth Users and brokerage memberships. Test search and pagination with more than 50 accounts. Verify that RLS and earlier invitation protections remain active for normal workspaces.

## Scope and limitations
This release gives the owner monitoring access, not blanket customer-data permissions. The existing Zen One Realty membership of the owner is unchanged. No account, invitation, brokerage, document or business record is deleted or transferred. The owner retains the existing password. Account suspension, session revocation, billing, feature flags, live presence tracking, support actions and external monitoring remain future work requiring server-side implementation and audit. Aggregate counts are exact query-time totals; benchmark at production scale. Activity shown is overview access only, not a full security audit. The source tests are static checks and TSX syntax transpilation, not live RLS tests or a production build.

## Account reset
Do not run a blanket DELETE on auth.users or cascade-delete brokerage records: several transaction, finance, document and audit references require retention or explicit disposition. The earlier test accounts remain intact. If the project is disposable, a separate staging Supabase project with the complete reviewed migration set is a safer clean-room test. For a same-project reset, first export backups and decide explicitly whether to preserve or remove associated CRM, transaction, storage and accounting records. No reset is bundled here.

## Emergency revoke
In SQL Editor, run `DELETE FROM rv_platform_private.admins WHERE user_id = (SELECT id FROM auth.users WHERE lower(email)='inderbains@gmail.com');` to remove platform privileges without deleting the account. The next overview request will fail. This does not revoke other account privileges or clear data already displayed in an open browser tab. Close/sign out of the admin page. Use Supabase's authorized account/security controls if credentials may be compromised.
