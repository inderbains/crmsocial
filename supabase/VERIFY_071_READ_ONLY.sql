-- RealVolt Fix 071 — read-only check. Should return false after migration.
SELECT EXISTS (
 SELECT 1 FROM pg_trigger t
 JOIN pg_class c ON c.oid = t.tgrelid
 JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public' AND c.relname='deal_files'
   AND t.tgname='rv070_completion_after_cir' AND NOT t.tgisinternal
) AS cir_email_gate_still_installed;
