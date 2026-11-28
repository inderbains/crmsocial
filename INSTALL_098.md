# RealVolt Fix 098 — One current transaction + integrated compliance correspondence

Base: Fix 097 transactions, closing panel and email history; Fix 079 Back Office dashboard. Keep Fix 095 SQL, Fix 096 document history and Fix 097 SQL/closing-packet function installed. This patch is presentation-only and does not change database permissions or financial actions.

## Install in GitHub
Upload/replace these files at the exact repository paths:
- app/transactions.tsx
- app/back-office-dashboard.tsx
- app/closing-panel.tsx
- app/lawyer-email-history.tsx
- lib/current-transaction.mjs (new)
- lib/current-transaction.d.mts (new)

Do not upload the ZIP itself. Wait for the Hostinger deployment to complete, then refresh the browser. No SQL or Edge Function change is needed if Fix 097 is installed.

## Behaviour
The approved original listing is superseded in Back Office navigation by its accessible, explicitly linked sale (Accepted offer, Sold, Completed, Archived). The agent and brokerage IDs must match. Old listing links resolve to the current sale. Deal stages and the folder counts use the same presentation logic; accounting/insights still use original records. Original records and documents remain intact; Fix 096 still loads authorized related documents. A collapsed/deleted offer does not hide an active listing. Distinct sale records, unrelated listings, and a listing with its own unresolved review/correction are not hidden. The existing approval timing and privacy rules do not change. The existing agent-only transaction folders are unchanged.

Lawyer correspondence appears once, inside Advanced compliance records, including archived sales. The CIR panel retains email sending and preview but no duplicate history. History refreshes following a send attempt and through the existing 15-second polling. Provider acceptance remains distinct from inbox delivery.

## Verify after deploy
1. Open Back Office > Deal stages and Approved for the linked LST-000001 / SLE-000002. Only the current sale appears for the linked approved listing. Click it and verify original listing and sale documents appear. Open an older listing notification and verify it resolves to the current sale.
2. Confirm an unrelated listing or standalone sale remains visible. Collapse an accepted offer on a test listing and verify the listing is visible again.
3. Open the approved sale, expand Advanced compliance records and check Lawyer email history. Verify history is absent from the CIR send panel and no duplicate standalone history appears. Send only to an authorized test address, confirm the history updates, and verify it remains in the closed file after archiving.
4. Test from a separate brokerage and agent account to confirm no other account's records are accessible.

Validation: seven executable grouping tests passed; four TSX files passed TypeScript syntax transpilation. No full production type-check/build or live Supabase verification was performed. Existing RLS and closing-packet restrictions remain authoritative. Dashboard and transaction queries retain their previous list limits; this is not a pagination redesign.
