# RealVolt v1.3 — Content Calendar & Scheduling Planner

## Purpose
This is the next module after Design Studio v1.2.2. It upgrades the existing Content Calendar into a practical, mobile-friendly planning workspace. **It does not publish to Meta or spend ad money.**

## Prerequisites
- Your existing RealVolt project with the **v1.2.1 role/mobile** and **v1.2.2 Design Studio** code installed.
- Existing `social_drafts` Supabase table from the original RealVolt schema, with Row Level Security enabled.
- No new SQL migration is required for this patch.

## Changed files (keep these paths)
- `app/page.tsx` — connects the new calendar, enables FB + IG channel selection in Design Studio, and saves updated draft scheduling data.
- `app/content-calendar.tsx` — new month/agenda calendar, date picker, channel targeting, review states, quick edits, and upcoming list.
- `app/globals.css` — responsive calendar styling.
- `lib/designs.ts` — backward-compatible optional scheduling fields.
- `lib/content-calendar.ts` — date, status, sorting, and channel helper logic.
- `tests/content-calendar-v13.test.mjs` — new focused tests.

## Installation via GitHub web UI
1. Back up your existing code or note the latest working commit ID.
2. Download and extract the patch ZIP locally.
3. In your `crmsocial` GitHub repository, upload/copy the **files** into their matching paths under `app/`, `lib/` and `tests/`. **Do not upload the ZIP itself.**
4. Replace the matching existing files when prompted. Do not delete unrelated files.
5. Commit changes and inspect the Hostinger build log. Your normal build command remains `npm run build`.
6. Open **Social Studio → Content Calendar**.

## How to test
1. In **Design Studio**, choose a template, add an authorized property photo and save a draft.
2. Open **Content Calendar**, select the saved draft, choose a future date and time.
3. Select **Facebook**, **Instagram**, or both, then save to calendar.
4. Switch between Month and Agenda views, filter by channel, and use the Move and Edit actions.
5. Mark a post **Ready for review**, then return it to Drafts with **Unplan** if needed.
6. Check the same agent's saved draft on a second sign-in session. The data is stored in `social_drafts` and scoped by the logged-in user.
7. Test the layout on a phone-sized window.

## Expected limitations (intentional)
- **No automatic publishing, background scheduler, Meta OAuth completion or paid advertisements.** These will be connected and tested later.
- Times are recorded in browser-local format along with the IANA timezone; the future Meta worker will need a timezone-aware conversion and validation before publishing.
- Only Facebook and Instagram are selectable for new scheduling plans; legacy LinkedIn drafts remain readable.
- Each saved design still belongs to the authenticated user under the existing Supabase RLS rules. Brokerage-only tools remain in Back Office.
- As before, any media used in real advertising must be owned or properly licensed by the agent.

## Verification in this package
- Six Design Studio regression tests passed, plus six new calendar tests.
- Syntax transpilation of the changed TypeScript/TSX files passed.
- A complete dependency-installed Next.js production build could **not** be verified in this environment; Hostinger build confirmation is required.
