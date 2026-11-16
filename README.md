# RealVolt v1.5.8 — Agent Website Studio & Live Profile Identity

This bundle includes the complete website module (`app/agent-site-studio`,
`app/site`, `app/site-domain`, `app/api/agent-site`, components, `lib/rv-agent-site`,
`proxy.ts`), a login-safe quick link, and SQL migrations 024 + 025.

**What's fixed:**

- Uses the existing signed-in Supabase access token for saves and domain actions.
- Publish link appears only after a successful save and anonymous public query.
- Website names, biography, professional title, phone, email, licence, headshot,
  and logo can be connected to the public marketing profile already used by
  Open House, through a database trigger.
- A green "My Agent Website" button appears on the signed-in CRM home screen.
- Modern, Classic, Luxury templates and custom colour themes remain available.
- Nothing in Open House, CRM, transaction, SignVolt or Back Office is overwritten.

## Installation
Read `START_HERE.txt` first. Do not upload the ZIP to GitHub directly.

## Troubleshooting
- A page `/site/your-slug` 404s if it isn't saved **and** published, or if an
  anonymous reader cannot see the row under the SQL migration RLS policy.
- If the Published toggle is changed but Save is not pressed, no live link is shown.
- If the site opens but has no picture, check the saved public marketing profile
  and that its `realvolt-agent-brand-public` Storage bucket exists (migration 022).
- Profile fields come from `agent_workspace_profiles`; public media URLs use
  the existing `lib/agent-profile.ts` helper.
- No real custom domain is automatically assigned by this code; DNS and TLS
  activation on Hostinger are separate.

## Security notes
- Supabase service-role keys must never be prefixed `NEXT_PUBLIC_`.
- We intentionally never read office_agents financial, CRM or billing data.
- The SQL trigger only updates the website owned by the edited public profile.
- The public status endpoint only returns readiness for a published slug.

## Verified
- Package file presence and import path checks.
- TypeScript parsed/transpiled locally where available.
- Live production build, database migration and route smoke tests: **not run**.
