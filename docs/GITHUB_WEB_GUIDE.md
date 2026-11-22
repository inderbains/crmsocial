# If you use GitHub in the browser only

**Recommended:** Download your latest repository ZIP and use the included guarded Node installer on your PC or in GitHub Codespaces. Then upload/commit only changed files.

If you cannot run Node, upload the **latest GitHub ZIP here**. It is important because the latest `app/back-office.tsx`, `app/realvolt-workspace.tsx` and `app/crm.tsx` must be merged, not replaced with November 20 copies. We can then provide exact replacement files matching your live code.

The `github-files` directory in this package contains only the components and helpers. It does **not** include full parent-file replacements, because doing that without the latest live code risks deleting recent features.

The parent-file integration the installer performs is:

- `app/back-office.tsx`: import/route `OfficeFinancialCompliance`, pass `userId` to `BackOfficeDashboard`, remove the old separate `TransactionUpdates` panel.
- `app/realvolt-workspace.tsx`: add `Financial & compliance` to the Trust & Accounting menu, wire CRM contact navigation.
- `app/crm.tsx`: support `openContactId` to select the correct client when a notification is clicked.
- `tsconfig.json`: exclude `reference-only`, `edge-editor`, backup folders from TypeScript checking.

No current SQL migration is needed. Deploying Supabase `closing-packet` is an independent operation and should not be confused with the Next.js GitHub build.
