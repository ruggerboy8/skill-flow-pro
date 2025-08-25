-- Clean out all user-submitted data while preserving foundational configuration
-- This will remove all scores, selections, evaluations, and user profiles
-- but keep domains, competencies, pro_moves, locations, organizations, and auth users

-- Delete user-submitted scoring and selection data
DELETE FROM public.weekly_scores;
DELETE FROM public.weekly_self_select;

-- Delete backlog data
DELETE FROM public.user_backlog;
DELETE FROM public.user_backlog_v2;

-- Delete evaluation data
DELETE FROM public.evaluation_items;
DELETE FROM public.evaluations;

-- Delete staff profiles and audit logs
DELETE FROM public.staff_audit;
DELETE FROM public.staff;

-- Delete weekly focus assignments (these should be recreated by admins)
DELETE FROM public.weekly_focus;

-- Note: This preserves:
-- - domains (foundational)
-- - competencies (foundational) 
-- - pro_moves (foundational)
-- - roles (foundational)
-- - locations (foundational)
-- - organizations (foundational)
-- - site_cycle_state (foundational)
-- - staging_prompts (foundational)
-- - auth.users (user accounts remain but profiles are gone)