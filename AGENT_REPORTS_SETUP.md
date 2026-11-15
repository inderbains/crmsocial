# Agent statements, document approval and activity history

Upload the updated application source to the existing repository. Run ONLY supabase/006_agent_reports.sql once, after 005 is installed. Do not rerun migrations 001–005. Existing brokerage memberships and assigned admins are still required. Keep the existing Hostinger environment variables.

## Transactions navigation

The Lawyer directory navigation entry is replaced by:

- Commission earned to date
- Commission report
- Yearly GST report
- Deductions & expenses

Inline lawyer search and entry remain available within listings and sales.

Select a year and/or individual transaction. Print / Save PDF opens the browser's print dialog; choose Save as PDF. Reports include brokerage/agent identity, transaction number, property, completion date, confirmed agent commission, commission GST, charges and their GST, net earnings before GST, and net payable including GST. Statements list office deductions, office fees and other expenses separately. These reports use confirmed transaction data, not bank balances.

Earned totals include Sale files with Approved status, completion date through today, and an admin-confirmed agent allocation. Files awaiting allocation are explicitly excluded. Yearly reports use completion year. This is a reporting convention, not automatic cash receipt recognition or a filed tax return. The GST report shows recorded output GST and GST on charges, not eligibility for input tax credits. Deductions are per transaction. Standalone monthly ledger charges are a future back-office feature.

## Numbering

TX-000001, TX-000002, etc. are allocated atomically within each brokerage as files are created. Conversion preserves the number. Existing files are numbered by creation timestamp, then ID for ties. Sequences do not reset annually. Accounts without a brokerage membership show Unassigned; provision their brokerage and backfill brokerage_id using 005 instructions before relying on numbering. Number counters are not writable by agents.

## Admin document approval

Each new file gets an initial required-contract checklist item. Listing-to-sale conversion adds a purchase-and-sale contract requirement while retaining the listing requirement. The assigned same-brokerage admin can add every other required item, link uploaded documents and verify receipt. The initial item is a starting checklist, not a complete legal/compliance checklist. Admin defines the complete requirements for the file. The database rejects approval until all listed requirements have a linked, verified document. Receipt never automatically approves a file; the admin approves it.

## Office deductions and agent allocation

In a submitted or approved file, the assigned admin confirms the agent's commission before fees/GST and records the GST amount. This can reflect the brokerage split rather than the full transaction-side commission. The admin then adds itemized office deductions, office fees or other expenses, with actual GST amounts recorded on each. Agents can view but cannot alter office charges or allocations. Net payable = confirmed agent commission + its GST - charges - GST on charges. A negative amount remains visible as a shortfall. This calculation does not execute a payout. The minimal entry panel has no correction UI yet; project-owner SQL updates remain audited.

## Automatic history and next back-office phase

Database triggers append actor, timestamp, record ID, and old/new values when transaction details/status, attachments, required-document checks, agent allocations, charges or closing-email records change after migration. Agents and admins cannot edit/delete this history through the client. The interface shows the latest 100 events per file. Earlier events are not reconstructed; project owners retain database-level control. This is an application activity trail, not an independent financial audit.

Bank statement import, trust/operating ledgers, deposit matching, bank reconciliation, payout posting and automated discrepancy/audit checks remain for the later Back Office phase. No bank integration or money movement is implemented in this update.

## Checks

npm test; npm run typecheck; npm run build. Local PostgreSQL-compatible integration checks verify 006 on existing records, stable per-brokerage numbering, listing conversion, approval gate, financial permissions, activity logging and tenant isolation. Verify against the configured Supabase project after applying the migration; live deployment is not performed by this package.
