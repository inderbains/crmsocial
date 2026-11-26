-- RealVolt Fix 071 — allow admin-confirmed Legal Completion without a sent CIR email.
-- Backs out only the Fix 070 CIR-email prerequisite. It does not modify any
-- transactions, email history, requirements, payment records, or bank ledgers.
-- Run in Supabase SQL Editor after backing up and testing on staging.
BEGIN;
DROP TRIGGER IF EXISTS rv070_completion_after_cir ON public.deal_files;
DROP FUNCTION IF EXISTS public.rv070_require_cir_before_completion();
COMMIT;
