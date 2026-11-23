# RealVolt Fix 061 — Combined replacement for Fixes 057, 058, 059 and 060

This is **one consolidated patch**, based on the preferred Version 6-style transaction page and the changes in Fix 056. **Do not reinstall Fixes 057–060 separately.** Use this package instead.

## What is included

- **057 / Realtor identity:** Our Realtor is taken from the file owner's RealVolt agent profile, not the cooperating Realtor. The cooperating brokerage/contact remains separate.
- **058 / Direct approval:** Admin notification opens the submitted transaction at its review panel. Review documents and choose Approve or Request Changes directly on the file without going to a separate queue. Accepted Offer is notification-only.
- **059 / Firm-sale submission:** Submit subject removal or direct sold in one workflow: documents, commission/GST and deposit holder, buyer and seller lawyer contacts, then one final Submit to Back Office. One commission-side entry for standalone Sale; separate listing and selling commission sides for a converted listing (this does NOT create two independent agent payouts).
- **060 / TypeScript repair:** Removes a redundant comparison with `collapse` in the default `rv_tx_action` branch. The `collapse` action remains available and continues to use `rv056_offer_update`.

## GitHub: replace these FIVE files *inside `app/`*

1. `app/transactions.tsx` — replaces existing file.
2. `app/direct-file-review.tsx` — add or replace file.
3. `app/transaction-actions.tsx` — replaces existing file; **this is the corrected version compatible with 059**.
4. `app/post-firm-details.tsx` — replaces existing file.
5. `app/staged-document-upload.tsx` — replaces existing file.

Do **not** upload these to the repository main/root directory. Do not upload a whole project and do not delete your other application files. You may upload all five in one batch from within the GitHub `app` folder, then commit **once**. On GitHub check that no extra root copies named `transactions.tsx`, `transaction-actions.tsx`, `post-firm-details.tsx`, or `staged-document-upload.tsx` were accidentally created.

## Supabase (only if Fix 059 SQL not installed)

`supabase/059_one_submit_firm_sale_commission_lawyers.sql` is bundled because the client code calls `rv059_submit_firm_with_details`. **It requires database migrations through 056**. Do NOT run this on live data before taking a backup and staging test. If you have *already successfully run 059*, do **not** rerun it solely because you installed this merged UI patch.

To check that the function exists, use Supabase SQL Editor:

```sql
select to_regprocedure('public.rv059_submit_firm_with_details(uuid,date,uuid,text,uuid,uuid,numeric,numeric,numeric,numeric,text,text)') as installed_function;
```

If installed_function is `null`, first verify prerequisite migrations through 056 are present, then run the **entire** `supabase/059_one_submit_firm_sale_commission_lawyers.sql` on staging, review the results, and apply to production only after validation. If it returns a function signature, leave 059 SQL alone.

## Verify after Hostinger deploy

1. `next build --webpack` reaches **Finished TypeScript** and deployment completes (GLIBC/SWC fallback warnings are not the cause of the former TypeScript failure).
2. Agent creates an Accepted Offer; Back Office gets notification **without requiring compliance approval at this status**.
3. Agent chooses Subjects Removed / Direct Sold, uploads required firm-stage documents, enters commission plus GST, deposit holder and both lawyers. The final submit succeeds only after those steps are complete.
4. Back Office clicks a **submitted-firm-sale** notification: the exact file opens with document verification and Approve/Request Changes in the file.
5. Open the file in Back Office and verify **Our Realtor** is the owner agent, *not* the cooperating agent.
6. Check subject extension and Offer Collapsed (the latter must still change the offer and return a linked listing to active according to the existing database function).
7. Review CIR and financial numbers against real records before issuing payments; bank receipt and agent payout still require actual verification.

## Validation boundaries

- Updated files passed TypeScript *syntax parsing*, relative local-import existence checks, and focused source assertions for Fix 057–060 and the previous TS2367 error.
- These are not a substitute for a full Next.js/TypeScript build or live integration testing. Source has existing unrelated test failures. This package has not been applied to GitHub or Supabase for you.
- The earlier `closing-packet` Supabase Edge Function remains deployed; no redeployment is required for this source-only combination.
