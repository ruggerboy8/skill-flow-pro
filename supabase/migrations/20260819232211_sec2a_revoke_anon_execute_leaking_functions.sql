select set_config('app.change_reason', 'SEC-2 batch A: revoke anon/PUBLIC execute on leaking SECURITY DEFINER functions', true);

-- SEC-2 batch A. Not yet applied; applied later in a supervised step.
--
-- Follows the exact pattern proven by SEC-1's function-grant fix
-- (20260819021706_sec1_revoke_function_execute_from_public.sql): a role-only
-- `revoke ... from anon` does nothing because Postgres grants EXECUTE on
-- functions to PUBLIC by default and anon inherits it. Every function below
-- is revoked from `public, anon` together, then re-granted to
-- `authenticated, service_role`.
--
-- Scope: batch A only locks anon/PUBLIC EXECUTE on functions whose real app
-- call sites are all authenticated or service-role (verified in the prior
-- read-only inventory). It does NOT rewrite any function body, including the
-- in-body cross-tenant checks tracked separately as batch B. It does NOT
-- touch the 16 Group 7 RLS-predicate functions, which anonymous queries rely
-- on inside RLS policies.
--
-- Exact signatures resolved live against pg_proc / pg_get_function_identity_
-- arguments before writing this file, because several names are overloaded
-- and an untyped `revoke execute on function foo` is ambiguous or fails.
--
-- Deliberately excluded here (batch B / left for a separate pass):
--   - save_eval_acknowledgement_and_focus(p_eval_id uuid, p_action_ids integer[])
--     the 2-arg overload. Only the 4-arg overload below is locked.
--   - get_staff_weekly_scores is locked here for anon access only; its
--     in-body cross-tenant check is batch B, not this migration.

do $$
declare
  fn text;
  fns text[] := array[
    'public.get_calibration(uuid, bigint, integer)',
    'public.get_eval_distribution_metrics(uuid, text[], integer, text, uuid[], integer[])',
    'public.get_location_domain_staff_averages(uuid, timestamptz, timestamptz, boolean, uuid[], integer[], text[])',
    'public.get_location_skill_gaps(uuid, integer, integer)',
    'public.get_performance_trend(uuid, bigint, integer)',
    'public.get_evaluations_summary(uuid)',
    'public.get_evaluations_summary(uuid, boolean)',
    'public.get_best_weekly_win(uuid)',
    'public.seq_latest_quarterly_evals(uuid, bigint)',
    'public.seq_latest_quarterly_evals(integer)',
    'public.get_staff_weekly_scores(uuid, text)',
    'public.org_visible_pro_moves(uuid, integer)',
    'public.save_eval_acknowledgement_and_focus(uuid, uuid, integer[], text)',
    'public.admin_fix_backfill_week_of()',
    'public.check_sequencer_gate(uuid, integer)',
    'public.get_resources_for_actions(bigint[], integer, uuid)',
    'public.get_pro_move_resources(bigint)',
    'public.get_materials_count(bigint[])',
    'public.get_resource_usage_summary(bigint)',
    'public.resolve_role_display_name(uuid, bigint)',
    'public.is_eligible_for_pro_moves(date, integer, date)'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;

-- Verify every locked function actually lost anon EXECUTE and kept
-- authenticated EXECUTE. Raises on any failure rather than assuming success.
do $$
declare
  fn text;
  fns text[] := array[
    'public.get_calibration(uuid, bigint, integer)',
    'public.get_eval_distribution_metrics(uuid, text[], integer, text, uuid[], integer[])',
    'public.get_location_domain_staff_averages(uuid, timestamptz, timestamptz, boolean, uuid[], integer[], text[])',
    'public.get_location_skill_gaps(uuid, integer, integer)',
    'public.get_performance_trend(uuid, bigint, integer)',
    'public.get_evaluations_summary(uuid)',
    'public.get_evaluations_summary(uuid, boolean)',
    'public.get_best_weekly_win(uuid)',
    'public.seq_latest_quarterly_evals(uuid, bigint)',
    'public.seq_latest_quarterly_evals(integer)',
    'public.get_staff_weekly_scores(uuid, text)',
    'public.org_visible_pro_moves(uuid, integer)',
    'public.save_eval_acknowledgement_and_focus(uuid, uuid, integer[], text)',
    'public.admin_fix_backfill_week_of()',
    'public.check_sequencer_gate(uuid, integer)',
    'public.get_resources_for_actions(bigint[], integer, uuid)',
    'public.get_pro_move_resources(bigint)',
    'public.get_materials_count(bigint[])',
    'public.get_resource_usage_summary(bigint)',
    'public.resolve_role_display_name(uuid, bigint)',
    'public.is_eligible_for_pro_moves(date, integer, date)'
  ];
  fn_oid regprocedure;
  anon_can_execute boolean;
  authenticated_can_execute boolean;
begin
  foreach fn in array fns loop
    fn_oid := fn::regprocedure;
    anon_can_execute := has_function_privilege('anon', fn_oid, 'EXECUTE');
    authenticated_can_execute := has_function_privilege('authenticated', fn_oid, 'EXECUTE');

    if anon_can_execute then
      raise exception 'SEC-2a verification failed: anon can still EXECUTE %', fn;
    end if;

    if not authenticated_can_execute then
      raise exception 'SEC-2a verification failed: authenticated lost EXECUTE on %', fn;
    end if;
  end loop;
end $$;
