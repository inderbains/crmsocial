# RealVolt Fix 049 — All 3 options in File Action dropdown

**Cause:** Fix 048 shows `Extend subjects` and `Offer collapsed` only if Back Office review is already `Approved`. The SQL RPC applies the same restriction. On Draft or Changes requested accepted offers, only `Remove subjects / mark firm sold` appears.

## New behavior
- **Remove subjects / mark firm sold** — subject removal date and four required document uploads (Subject Removal PDF, Title Search, PDS, Deposit Cheque Copy), plus optional addendums (multiple files).
- **Extend subjects** — new subject date and signed extension PDF.
- **Offer collapsed** — confirm/close, **no documents**.
- The same dropdown is available when an accepted-offer file is Draft, Submitted, Changes requested or Approved. Actual action updates are audit logged and sent to the office (subject extensions and collapsed offers), subject to agent ownership and the transaction still being conditional. Completion extensions remain restricted to an approved firm sale.
- The post-firm lawyer/commission form and other transaction features are unchanged.

## Installation: exactly TWO items
1. **SQL:** Back up your Supabase database. In **SQL Editor → New query**, paste ALL of `supabase/049_accepted_offer_all_actions.sql` and click Run once. The file consists of one complete `DO` statement; never highlight or execute a fragment. Confirm Success. It replaces only `public.rv_tx_action`, retaining the Fix 048 mandatory firm documents and optional no-document collapse.
2. **GitHub:** Go to `github.com/inderbains/crmsocial/tree/main/app`; **replace** `app/transaction-actions.tsx` with the file in this ZIP. Do NOT upload into the repository root. Leave `transactions.tsx`, `staged-document-upload.tsx` and other files unchanged.
3. After Hostinger builds, open an *Accepted offer* as an agent and confirm the dropdown contains all three. Use separate test transactions to test each outcome; collapsing closes the file.

## Prerequisites
Assumes Fix 048 application files and SQL 047/048 are already installed. Do not rerun prior SQL migrations.

## Verification
TSX parsed with TypeScript and 7 targeted tests passed. SQL statement boundaries checked. **Not executed against a live database; full Hostinger/Next.js build not performed.**

## Safety
The SQL remains scoped to the signed-in agent's brokerage and file. Test in staging before production. The office receives notice of a collapsed sale or subject extension; documents remain subject to secure-storage and RLS policies.
