-- Read-only checks: one receipt function and the new verification gate.
SELECT 'Atomic commission receipt RPC' AS check_name,
 to_regprocedure('public.rv072_receive_commission_funds(uuid,uuid,numeric,date,text)') IS NOT NULL AS installed
UNION ALL
SELECT 'Receipt-to-ledger verification trigger',
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.deal_files'::regclass
 AND tgname='rv073_external_receipt_ledger_gate' AND NOT tgisinternal);

-- Run this after selecting the actual transaction in the UI. Do not fabricate a receipt.
-- Bank statement matching remains in the Bank Reconciliation module.
