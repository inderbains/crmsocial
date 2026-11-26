-- Read-only verification of Fix 070 database guard and existing email system.
SELECT
  to_regclass('public.closing_deliveries') IS NOT NULL AS closing_delivery_table_present,
  to_regprocedure('public.rv070_require_cir_before_completion()') IS NOT NULL AS completion_guard_function_present,
  EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'rv070_completion_after_cir'
       AND NOT tgisinternal
  ) AS completion_guard_trigger_present;
