-- Read-only verification after migration 047
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='deal_files'
      AND column_name='rv_post_firm_details_confirmed'
  ) AS post_firm_column,
  to_regprocedure('public.rv_save_post_firm_details(uuid,uuid,uuid,numeric,numeric,numeric,numeric,text,text)') IS NOT NULL
    AS post_firm_rpc,
  EXISTS (SELECT 1 FROM public.rv_compliance_templates WHERE label='Title search')
    AND EXISTS (SELECT 1 FROM public.rv_compliance_templates WHERE label='Property Disclosure Statement (PDS)')
    AS title_and_pds_templates;
