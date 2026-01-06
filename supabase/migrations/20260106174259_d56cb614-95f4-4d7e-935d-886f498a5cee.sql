-- Fix Security Definer views by setting security_invoker=true
-- This ensures views respect the RLS policies of the querying user, not the view creator

-- Set security_invoker=true on all public views that don't have it set
ALTER VIEW public.view_staff_submission_windows SET (security_invoker = true);
ALTER VIEW public.pro_move_usage_view SET (security_invoker = true);
ALTER VIEW public.v_onboarding_progress SET (security_invoker = true);
ALTER VIEW public.view_weekly_scores_with_competency SET (security_invoker = true);
ALTER VIEW public.action_usage_stats SET (security_invoker = true);
ALTER VIEW public.view_weekly_scores_audit SET (security_invoker = true);