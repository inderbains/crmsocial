# RealVolt Fix 099 — Automatic commission statement and simplified completion

Prerequisites: installed Fix 072 (optional internal PDFs), 073 (commission receipt + operating ledger), 095 (privacy/offer visibility), 097 (lawyer email), 098 (unified transaction/compliance). Do NOT reapply the older 072 migration over 073: it contains an older version of the receipt RPC. Use staging first.

## 1. Supabase SQL Editor
Run all contents of `supabase/099_automatic_commission_statement.sql` as one query. It keeps the redundant internal completion confirmation optional, adds a service-role-only statement registration function, and prevents a newly completed sale from being archived until its automatic paid-payout statement is saved. It does not change or post any financial entry. No existing files are deleted. Existing archived files are not changed.

## 2. GitHub
Upload these files, preserving paths:
- `app/transactions.tsx` (replace Fix 098 version)
- `app/automatic-commission-statement.tsx` (new)
- `app/transaction-commission-payout.tsx` (replace Fix 073 version; General account wording only)
- `supabase/functions/closing-packet/index.ts` (replace Fix 097 version)
- `supabase/functions/closing-packet/deno.json` and `supabase/functions/_shared/{calculations.mjs,pdf.mjs}` are the unchanged Fix 097 supporting files. Keep them at the same paths.

## 3. Supabase Edge Function
Redeploy `closing-packet` using the repository/CLI workflow (include its shared files). From the repository root with the correct Supabase project linked:
```
supabase functions deploy closing-packet
```
Existing secrets and email settings are unchanged. Deploy the function before using the new UI. Wait for successful Hostinger deployment. Do not expose service-role keys in the browser.

## 4. Test on a disposable sale
1. Before payout, confirm the old Final completion documents panel no longer appears. Legal completion date and lawyer letter remain available; no separate completion PDF needs generation (Fix 072 required).
2. For an external commission receipt, select an existing active General (database kind `Operating`) account, enter the actual amount/date/reference, and confirm. Verify ONE positive ledger entry for the deal. No physical bank transfer is performed. Do not enter a second receipt for the same funds. For a client deposit held in the brokerage's trust account, record the authorized trust-to-General transfer in Trust & Bank; do not post another receipt here.
3. Authorize payout and record the actual cheque/EFT payment through existing workflow. The UI automatically requests the statement when it detects Paid, including when reopening a completed file. While the file is open, checks recur every 20 seconds. Payments recorded elsewhere are processed when the completed file is opened. This is not a scheduled background job.
4. Expand Advanced compliance records. Open the private commission statement; compare the gross, GST, deductions, net, date and reference to the actual payout. It is also listed in submitted documents and remains accessible under existing transaction access rules. The existing lawyer email allowlist excludes this statement. Repeat refresh and verify only one new canonical statement per payout. Previously saved manual PDFs are preserved.
5. Verify required compliance items and close the sale. If the automatic statement has not been saved, closing is blocked until it succeeds. The existing bank, lawyer letter, paid payout and mandatory compliance guards remain in effect. Existing archived sales are not regenerated.
6. Test separate agent and brokerage accounts for document isolation. Verify the existing CIR/lawyer-email flow still works.

No new account creation, EFT/bank integration, trust transfers or bank reconciliation redesign in this update. The bank module will be configured separately. The General/Operating distinction is a display label, not a change to the account-kind enum. Test against actual database and storage policies before production.
