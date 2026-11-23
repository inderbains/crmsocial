-- Read-only: Diagnose RealVolt 006, 044, 046 compliance prerequisites.
SELECT
  to_regclass('public.deal_requirements') IS NOT NULL AS migration_006_checklist_present,
  to_regclass('public.rv_compliance_templates') IS NOT NULL AS migration_044_templates_present,
  to_regprocedure('public.rv_link_uploaded_compliance_doc(uuid,uuid,text,boolean)') IS NOT NULL AS migration_046_linker_present;
