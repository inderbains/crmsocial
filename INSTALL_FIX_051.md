# RealVolt Fix 051 — Transaction action selection and CIR diagnostics

**Based on the user's uploaded `crmsocial-main (5).zip`.** This is a targeted follow-up to Fix 050; it does not replace Fix 050's SQL/document rules.

## What this update does

1. Keeps the File action `<select>` controlled, but clears form state without clearing the selected option during the same event. Adds a pointer/stacking safeguard.
2. Stops remounting the transaction-action component whenever unrelated documents refresh (the React `key` is now the deal ID alone).
3. Shows only **Back Office verified** supporting documents in the CIR selection list; none are selected by default. Internal agent expense and GST reports are excluded at the UI and Edge Function levels.
4. Distinguishes a missing `closing-packet` function (HTTP 404) from a general connection/network problem.

### Important observation

In the provided source code, `TransactionActions` is imported once by `transactions.tsx` and rendered once within the transaction detail. The screenshot showing 4–7 repeated blocks **does not match this source**. This patch does **not** claim to have reproduced or fixed the duplication at runtime. It may come from an older deployed bundle, multiple running app instances, or a DOM/client integration issue. After deploying, test with a private/incognito window, a hard refresh, and inspect DOM/devtools if duplication persists. A screenshot alone cannot establish the root cause.

## Files to replace (preserve paths)

- `app/transaction-actions.tsx`
- `app/transactions.tsx`
- `app/closing-panel.tsx`
- `supabase/functions/closing-packet/index.ts`
- Optional source verification: `scripts/verify-fix-051.mjs`

**Do not** replace the entire `supabase/functions/` directory with the zip contents. The existing `_shared/calculations.mjs` and `_shared/pdf.mjs` must remain in the repository; the Edge Function imports them.

## Deployment procedure

1. Back up and commit your current code first. Confirm Fix 049 + Fix 050 SQL migrations are installed in the target Supabase project. Fix 051 introduces **no new SQL migration**.
2. Replace the four files using the same relative paths in GitHub. Commit. Deploy and verify the Hostinger Next.js build succeeded. This deploys website changes only.
3. On a computer with the complete GitHub repository checked out, from repository root, use Supabase CLI (do not paste keys here):

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
   npx supabase functions deploy closing-packet --project-ref YOUR_SUPABASE_PROJECT_REF
   ```

   The `supabase/config.toml` must retain `[functions.closing-packet] verify_jwt = false`; the function checks the authenticated bearer session internally. Confirm the project reference is the **same project** configured for the hosted website in `NEXT_PUBLIC_SUPABASE_URL`.
4. In the Supabase Dashboard, inspect **Edge Functions → closing-packet → Logs**. Check `CLOSING_FROM_EMAIL`, `RESEND_API_KEY`, the brokerage sender/reply-to email, and the function's role/auth permissions. Do **not** share any secret keys in chat. Supabase normally provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions.
5. Test two roles in staging: agent sees one File action panel for a conditional sale and can choose firm sale, extension or collapsed; admin opens an Approved firm sale, previews CIR and completion letter, sees only verified supporting attachments, and sends only after reviewing the recipient. Confirm approved internal reports are *never* offered.

If dropdown repetition persists after a fresh build in an incognito window, capture browser devtools **Elements** (count of `[aria-label="Transaction actions"]`) and **Console**, plus the running Git commit hash. That is needed to identify why multiple instances are mounted despite a single source mount.

Run `node scripts/verify-fix-051.mjs` as a **source check only**. All changed TSX/TypeScript files passed syntax-only transpilation. A whole-app typecheck/build and browser interaction test were not run in this environment.

The uploaded baseline reports **33 failures out of 141 tests** (`node --test tests/*.test.mjs`); this patch reports the **same 33 failures**. These are existing repository failures and need a separate cleanup before production; do not claim this patch passed the complete test suite.

**Document-side review needed:** Fix 050 currently requires **Sale Report Form for the listing/seller side** and **Receipt of Funds for the selling/buyer side**. That is opposite the user's earlier wording that *their own listing sold* should require Receipt of Funds. This Fix 051 intentionally preserves the currently installed 050 logic rather than changing database requirements without a matching, separately tested SQL migration. Confirm/correct the side mapping before using it for compliance enforcement.

### No production changes applied

This package was created from the uploaded archive. It has not changed your GitHub, Hostinger, or Supabase project; cannot certify whether the missing Edge Function is actually deployed or if browser UI duplication has been resolved.
