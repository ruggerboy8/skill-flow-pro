-- SEC-1 follow-up. Applied to production 2026-08-18 via Supabase MCP.
--
-- The first migration revoked EXECUTE from `anon` and it had NO EFFECT. Postgres
-- grants EXECUTE on functions to PUBLIC by default, and `anon` inherits it, so a
-- role-specific revoke leaves the door open. This was caught only because the fix
-- was verified afterwards rather than assumed.
--
-- These functions are SECURITY DEFINER, so they run with owner privileges and
-- return the same data regardless of the security_invoker change above. Closing
-- the views without this leaves the exposure fully open.
--
-- Verified before applying: all eight call sites are behind login, so removing
-- anonymous access breaks nothing.

do $$
declare
  fn text;
  fns text[] := array[
    'public.get_staff_all_weekly_scores(uuid)',
    'public.get_staff_submission_windows(uuid, date)',
    'public.get_coach_roster_summary(uuid, date)',
    'public.get_calendar_week_status(uuid, integer)',
    'public.compute_eval_self_scores(uuid)',
    'public.compute_eval_participation_snapshot(uuid)',
    'public.get_strengths_weaknesses(uuid, uuid[], integer[], text[], timestamptz, timestamptz)',
    'public.compare_conf_perf_to_eval(uuid, integer, uuid[], integer[], text[], timestamptz, timestamptz)'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;
