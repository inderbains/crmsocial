# RealVolt Fix 064 — One lawyer/commission panel per transaction

## Problem
The same **After subjects removed — lawyers & commission** panel is appearing many times in Back Office and 4–5 times in Agent Transactions. The currently published `app/transactions.tsx` contains only **one** explicit `PostFirmDetails` rendering; this is not a simple duplicated JSX line.

## Change
- Adds a **defensive single-visible-instance guard** inside the shared `app/post-firm-details.tsx` component, keyed to the transaction ID.
- If duplicate component instances mount concurrently, only one panel is shown. Preference is given to the instance that has a resolved assigned Realtor name.
- Surviving panel continues to support **Edit details**, lawyer info, both commission sides, GST, deposit-holder settings and existing Supabase calls.
- Does not touch uploads, approval logic, money calculations or SQL.
- Logs duplicate component mounts in the browser console to help diagnose *why* the page is creating extra instances.

## GitHub (ONLY 1 FILE)
1. Back up the existing `app/post-firm-details.tsx` in GitHub.
2. Open the **app/** folder, and upload this package's `app/post-firm-details.tsx` to replace it. **Do not upload to repository root.**
3. Commit, and verify a successful Hostinger build.
4. Hard-refresh RealVolt (`Ctrl+Shift+R`). Open the **same Sold file** from Agent Transactions and Back Office Review Queue. Check that **exactly one** lawyer/commission panel appears per view, and that Edit details works. Do not authorize a payment as part of this visual test.

## Limitations
This guards against multiple instances of the same component; it does **not establish why multiple instances were mounted**. If cards still duplicate, the likely cause is a second loaded code version, stale browser assets or direct DOM duplication. We will need browser-console details and the current deployed source to trace that separately. Do not assume other repeated sections (such as Final Completion Documents) are fixed by this patch.

## Verification performed
- Based on the publicly available current `app/post-firm-details.tsx` source matching Fix 061.
- Updated TSX passed TypeScript transpile/syntax validation.
- Full Next.js production build and live browser behavior are **not tested**.
- No new SQL or Supabase Edge Function deployment required.
