-- SEC-1: close the unauthenticated read surface.
-- Applied to production 2026-08-18 via Supabase MCP; committed here so the repo
-- matches production (see GOV-1). Idempotent.
--
-- Employee names, personal email addresses and performance scores were readable
-- by any anonymous caller across all four tenants, verified live by two
-- independent reviewers during the 2026-08-18 assessment.

-- 1. Views stop bypassing row-level security.
alter view public.view_evaluation_items_enriched      set (security_invoker = true);
alter view public.view_weekly_scores_with_competency  set (security_invoker = true);
alter view public.view_staff_submission_windows       set (security_invoker = true);

-- 2. Anonymous callers lose read access to them outright.
revoke select on public.view_evaluation_items_enriched     from anon;
revoke select on public.view_weekly_scores_with_competency from anon;
revoke select on public.view_staff_submission_windows      from anon;

-- 3. Lock the two leftover hollow-evals repair tables. RLS enabled with no
--    policies means no access except service_role. Deliberately not dropped.
alter table public.eval_payload_recovery_backup enable row level security;
alter table public._eval_repair_targets         enable row level security;
revoke all on public.eval_payload_recovery_backup from anon, authenticated;
revoke all on public._eval_repair_targets         from anon, authenticated;
