# RealVolt 046D — Connect named document slots to Transactions

The previous Fix 046 introduced app/staged-document-upload.tsx and CSS but the currently shown transaction page still uses the generic `deal-upload` input. The missing step is updating app/transactions.tsx to render the new component. This package contains a ready-to-upload app/transactions.tsx derived from the last RealVolt 044 source provided to this conversation, with Fix 046 integrated. It **has not** been verified against the latest live GitHub commit; compare it with your current version before replacing to avoid losing unrelated recent modifications.

## Before uploading

- Make sure `app/staged-document-upload.tsx` and `app/staged-document-upload.module.css` are already committed in GitHub.
- Compare the current `app/transactions.tsx` to this version if other work may have changed it.
- Open GitHub > `crmsocial` > `app` > Add file > Upload files; upload **only** `transactions.tsx` from the `app/` folder inside this download. Confirm file will replace `app/transactions.tsx`, not appear at repository root. Commit.
- Do **not** upload the ZIP itself to GitHub root. Do **not** upload README to `app`.
- If GitHub refuses to overwrite existing file, use edit current file and make targeted changes in the instructions below. Avoid pasting only a partial file.

## What changed

1. Import `StagedDocumentUpload` from `./staged-document-upload`.
2. Add the `requiredReady` state and reset it when switching transaction files.
3. Replace the single generic `deal-upload` input with `StagedDocumentUpload` just after the Attached documents heading.
4. Require staged document readiness for Submit to Back Office.
5. Preserve the existing attached document list, transaction actions, Back Office checks, and closing panel from Fix 044.

## Supabase diagnostic (READ ONLY)

Run in Supabase SQL Editor:

```sql
SELECT
  to_regclass('public.deal_requirements') IS NOT NULL AS migration_006_checklist_present,
  to_regclass('public.rv_compliance_templates') IS NOT NULL AS migration_044_templates_present,
  to_regprocedure('public.rv_link_uploaded_compliance_doc(uuid,uuid,text,boolean)') IS NOT NULL AS migration_046_linker_present;
```

All three should be true. If any false, the application will not be able to retrieve/show document requirements. **Do not re-run migrations blindly.** Inspect existing schema/previous migrations in staging and apply only missing prerequisites in order. The notice in the screenshot mentions 006 and 044 specifically.

## Validation

The Transactions component was checked for a single StagedDocumentUpload mount, absence of the old `deal-upload` input, gated Submit action, and TSX syntax. A full Next.js build on the current live branch has NOT been completed or verified.
