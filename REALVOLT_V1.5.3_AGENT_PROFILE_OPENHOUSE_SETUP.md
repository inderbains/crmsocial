# RealVolt v1.5.3 — Agent Profile + Open House Poster Templates

**Prerequisites:** RealVolt v1.5.1 (Open House TypeScript fix) and its migration `021_open_house_qr_checkin.sql`. Keep all current CRM, Back Office and other files.

## What changes

- **My Profile & Billing → Your public agent profile:** The agent edits headshot, optional approved branding logo, full name, title, phone, public email, biography, licence number and website. These fields are intended to appear in public marketing. Brokerage name is sourced from actual membership, not a self-selected brokerage role. This works even when the agent has not accepted a brokerage invitation, provided migration 008 exists.
- **Open Houses → Create:** RealVolt fills the agent name, public contact email, phone and brokerage name automatically from the saved profile. Existing events keep their last-saved information until **Refresh from My Profile** is clicked and the event saved. The QR poster uses the current headshot, title and approved logo from the profile.
- Open House creator now uses **one date**, **From** time and **To** time, with the specified event time zone. The date/time converter handles Pacific daylight saving changes and rejects nonexistent local times.
- Five selectable QR poster styles: Classic Green, Modern Split, Luxury Dark, Minimal White and Bold Orange. Poster style persists per Open House.
- **Unchanged:** visitor QR registration, public MLS sheet viewing, CRM lead attribution and follow-up, Meta/DDF integrations on hold, welcome emails not enabled.

## Install — GitHub (small patch, not the full app)

1. Extract the ZIP **on your computer**. Upload the file contents to matching folders in `inderbains/crmsocial` (not the ZIP itself):
   - `app/agent-marketing-editor.tsx` **new**
   - `app/agent-account.tsx` **updated**
   - `app/open-house-manager.tsx` **updated** — incorporates the earlier v1.5.1 TypeScript fix
   - `app/page.tsx` **updated** (opens My Profile from Open House)
   - `app/globals.css` **updated**
   - `lib/agent-profile.ts` **new**
   - `lib/open-house.ts` **updated**
   - `supabase/022_agent_marketing_profile_open_house_templates.sql` **new**
   - `tests/agent-profile-openhouse-v153.test.mjs` optional test
2. In your existing Supabase project's SQL Editor, ensure migrations **008** and **021** were applied, then run **022** once. The script adds columns to the agent workspace profile, creates a public marketing-image bucket and adds the poster style to existing Open House events. It does NOT change agent roles or billing.
3. Commit the GitHub changes and check the Hostinger build.
4. In RealVolt go to **My Profile & Billing**, complete **Your public agent profile**, upload headshot/logo, then click **Save marketing profile**.
5. Open **Open Houses → Create open house**. Enter the property details, one date, From/To times, MLS PDF, property photo, and select a style. The agent details appear automatically. Print the QR sign and test the visitor form with a non-production test contact.

## Privacy and testing

Profile headshots and uploaded approved logos are hosted in a **public** storage bucket for printable/public marketing. Never upload private identity documents or confidential files there. Only an authenticated user can upload under their own user-ID prefix. `agent_workspace_profiles` already enforces agent ownership through row-level security.

The existing Open House MLS PDF bucket is also public, so upload only an MLS sheet you have permission to distribute. Contact details and CRM check-ins are kept in private tables; the marketing profile is separate from billing information.

This is a code patch; no live Supabase schema changes, Meta connections, live hosting deployments or DDF authorizations were performed in this environment. A full Hostinger production build still needs to be verified after upload.
