-- READ-ONLY: check that previously installed RealVolt tables and functions exist.
SELECT
  to_regclass('public.rv_tx_summary') IS NOT NULL AS transaction_summary_ready,
  to_regclass('public.rv_transaction_notifications') IS NOT NULL AS notifications_ready,
  to_regclass('public.office_ledger') IS NOT NULL AS accounting_ledger_ready,
  to_regclass('public.office_reconciliations') IS NOT NULL AS reconciliations_ready,
  to_regclass('public.deal_requirements') IS NOT NULL AS requirements_ready,
  to_regprocedure('public.rv_tx_action(uuid,text,date,uuid,text)') IS NOT NULL AS lifecycle_ready,
  to_regprocedure('public.rv_remove_deal_document(uuid,uuid)') IS NOT NULL AS remove_attachment_ready,
  to_regprocedure('public.rv_brokerage_sales_leaderboard(text,text)') IS NOT NULL AS firm_leaderboard_ready;
