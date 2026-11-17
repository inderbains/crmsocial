# RealVolt — one logo everywhere (branding-only patch)

## What this changes
The same orange RealVolt icon and green `realvolt.` wordmark are used in:
- Public RealVolt welcome-page header
- Public welcome-page footer (white wordmark on the dark background for contrast)
- Log in / create-account dialog
- RealVolt workspace/sidebar branding
- Workspace fallback sign-in screen
- Browser tab icon / favicon

The logo matches the screenshot's visual palette: orange tile `#da2c00`, pale-lime lightning bolt `#d8f38a`, dark-green wordmark `#193e32`, green dot `#85a06a`.

Agent-owned websites are intentionally unchanged: agents can continue using their own headshots, business names and brokerage logos. SignVolt remains named SignVolt.

## Installation (GITHUB — please do not upload files into repository root)

Back up the current branch first or create a new branch.

1. Extract this ZIP **on your computer**.
2. In GitHub, replace these exact files with the included matching files:
   - `components/rv-marketing/MarketingLanding.tsx`
   - `app/realvolt-workspace.tsx`
3. Create the folder `components/rv-brand` and upload the following into THAT FOLDER:
   - `RealVoltLogo.tsx`
   - `RealVoltLogo.module.css`
4. Upload `app/icon.svg` into `app/` (browser tab icon). If an existing app/favicon.ico exists, it can override this; remove/replace it only after verifying the icon.
5. Commit to main. Hostinger will redeploy.

Never replace `app/page.tsx`, CRM or Open House code to do this branding update. Don't upload `RealVoltLogo.tsx` into repository root: its import path must be `components/rv-brand/RealVoltLogo.tsx`.

## Compatibility
This patch targets the v1.7.0 RealVolt public welcome page and `app/realvolt-workspace.tsx` from the v1.7.0 landing/login release. If you have changed those files since then, merge the small logo edits instead of overwriting newer work.

## Test
- `/` public header uses the same new logo as the workspace
- Log in dialog uses it
- `/workspace` sidebar uses it
- Browser tab has orange RealVolt icon
- No module paths, subscriptions, forms, CRM or Open Houses have changed

Source-check only: the replaced TSX files were syntax/transpile-checked, but a full Next.js production build was not run as part of this branding-only patch.
