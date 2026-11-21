-- READ ONLY: verify SQL 031 and 032 are installed before testing.
SELECT
 to_regclass('public.rvcrm_deal_milestones') IS NOT NULL AS milestones,
 to_regclass('public.rvcrm_qualification_audit') IS NOT NULL AS qualification_audit,
 to_regclass('public.rvcrm_followup_nudges') IS NOT NULL AS followup_log,
 to_regclass('public.rv_ai_generations') IS NOT NULL AS ai_usage,
 to_regprocedure('public.rvcrm_schedule_followups(integer)') IS NOT NULL AS followup_worker,
 EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='rvcrm_milestone_record' AND tgenabled='O') AS milestone_trigger,
 EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='rvcrm_qualify_after_contact' AND tgenabled='O') AS qualification_contact_trigger,
 EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='rvcrm_qualify_after_profile' AND tgenabled='O') AS qualification_profile_trigger;
