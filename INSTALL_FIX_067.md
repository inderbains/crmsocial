# RealVolt Fix 067 — Hide admin compliance on agent Transactions

**Based on:** `crmsocial-main (9).zip` plus Fix 066 (Delete Draft Transactions).

## What changes

- Agent Transactions no longer renders the `Compliance & commission — click to expand` panel (`DealAdmin`).
- Agent Transactions no longer renders the post-completion `ComplianceClosingPanel` (admin compliance/financial-close section).
- Back Office Transactions still renders those panels. The direct notification review panel, document verification, approval, and request-changes controls are unchanged.
- Agent **Documents & uploads**, **Transaction actions**, **Post-firm Lawyers & Commission entry**, submission/approval status, reminder popup and Delete Draft remain in place.
- No database, SQL, Supabase Edge Function, or accounting calculations are changed.

## Install

1. In GitHub open repository `inderbains/crmsocial`, then open its **app** folder.
2. Upload `app/transactions.tsx` from this ZIP into GitHub's `app/` folder, replacing that file. **Do not place it at the repository root.**
3. Commit; Hostinger redeploys automatically if connected.
4. On the agent workspace, open a listing and a subject-removed sale. Confirm there is no `Compliance & commission` panel and the agent can still upload required documents and enter lawyer/commission/deposit information.
5. On Back Office, open a submitted file directly from its notification. Confirm direct review, verify, Approve and Request Changes still work. For completed files, verify admin closing compliance remains visible.

## Validation and limitations

- TSX source parsed and transpiled with TypeScript 5.8.3 without syntax errors.
- Only two display conditions were changed in `transactions.tsx`.
- Full Hostinger/production deployment and end-to-end permission tests are not performed in this package. Back up the original `app/transactions.tsx` before replacement.

**Note:** This patch uses the previously supplied Fix 066 transaction file as its base. If your live `app/transactions.tsx` has changed since Fix 066, compare before replacing so newer changes are not overwritten.
