-- APPLIED LIVE 2026-08-05. Idempotent repo record.
-- 1) 'management' added as a valid coaching-issue source (catch-all for exec asks).
alter table public.coaching_issue_sources drop constraint if exists coaching_issue_sources_source_type_check;
alter table public.coaching_issue_sources add constraint coaching_issue_sources_source_type_check
  check (source_type = any (array['visit'::text, 'doctor'::text, 'leads'::text, 'signal'::text, 'management'::text]));
-- 2) Platform-library writes: platform admins OR can_manage_library (enables
--    Lauren's DFI Pro Move upkeep without the platform role). Full policy body
--    in applied migration "management_source_and_library_policy".
