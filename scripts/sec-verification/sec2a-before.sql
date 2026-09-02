-- SEC-2 batch A verification: BEFORE state.
-- Read-only. Run against the live database before applying
-- supabase/migrations/20260819232211_sec2a_revoke_anon_execute_leaking_functions.sql
-- to confirm anon currently has EXECUTE on every targeted function.
--
-- Expect every row's anon_execute to read true here. After the migration
-- runs, sec2a-after.sql should show every row false.

select
  sig,
  sig::regprocedure as resolved_signature,
  has_function_privilege('anon', sig::regprocedure, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', sig::regprocedure, 'EXECUTE') as authenticated_execute
from unnest(array[
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
]) as sig
order by sig;
