# RealVolt v1.2.1 — Design Studio + brokerage-only controls + mobile navigation

## Apply to
The existing RealVolt v1.1 Meta Social + Ads codebase. **The package also includes the v1.2 Design Studio update**, so you do not need to upload v1.2 separately. It does not replace the whole project.

## Files to place into the same repository paths
- `app/page.tsx` — verifies brokerage administrator membership, hides Back Office from agents, adds Back Office → Brokerage Control and mobile menu, and includes the v1.2 design editor.
- `app/workspace-home.tsx` — removes the misleading self-selected Brokerage workspace option and displays Back Office only for verified administrators. Shows the actual brokerage name from this user's membership rather than an arbitrary office.
- `app/meta-connections.tsx` — agent Social Studio shows **My Accounts only**; brokerage Meta account connections appear only in Back Office → Office Meta Accounts, with server-verified admin permission.
- `app/globals.css` — responsive mobile navigation drawer, backdrop, tap targets and compact layout.
- `app/design-canvas.tsx` — expanded editable property social-graphic templates (from v1.2).
- `lib/designs.ts` — expanded design templates, custom property data and draft fields (from v1.2).

## Installation
1. Back up current GitHub `main` before uploading.
2. Extract the ZIP locally. In GitHub, replace **only the six files listed above**, in their matching `app/` and `lib/` paths. Do not delete or replace other files.
3. Commit changes and verify the Hostinger build finishes successfully.
4. Log in as an agent. Confirm **Back Office is absent** and Social Studio → Connections shows **My Accounts**, with no brokerage switch.
5. Log in as a verified brokerage administrator. Confirm **Back Office → Brokerage Control** shows Office Meta Accounts, Office DDF & Listings, Office Lead Routing and Brokerage settings.
6. Narrow the browser width / use a phone: open the hamburger menu; navigate and close it; verify modal/content layout.
7. Open **Social Studio → Design Studio** to use the additional templates with manually uploaded photos.

## Security and limitations
- Permission is based on `brokerage_members.role='admin'` and an `is_brokerage_admin()` authorization check in Supabase. A self-selected workspace label can no longer create brokerage access.
- Backend row-level security and server-side API authorization remain essential. UI hiding is not a substitute for these controls. The existing Meta connection tables from migration `018_meta_social_ads_connections.sql` already use admin-scoped RLS; do not bypass those policies.
- Existing brokerage administrators must already be provisioned in `brokerage_members`; the process for creating a new brokerage admin is a separate onboarding step.
- This patch does not connect live DDF, Meta publishing, paid advertising, or email delivery. No SQL change is needed for this patch itself.
- The mobile layout is an app-like responsive interface, **not yet a full installable PWA**.
- This source passed a TypeScript/JSX syntax check, and focused static role-routing tests; a complete production build must still be verified in Hostinger.
