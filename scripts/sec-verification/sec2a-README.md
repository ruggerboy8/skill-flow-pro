# SEC-2 batch A verification

What batch A does: revokes anon and PUBLIC execute on 21 SECURITY DEFINER
function signatures in `public` that currently leak data (or accept writes)
to unauthenticated callers, then re-grants EXECUTE to `authenticated` and
`service_role`. It does not change any function body and does not touch the
16 Group 7 RLS-predicate functions that anonymous queries rely on inside RLS
policies.

Migration: `supabase/migrations/20260819232211_sec2a_revoke_anon_execute_leaking_functions.sql`

## Exact signatures locked (21)

- `public.get_calibration(uuid, bigint, integer)`
- `public.get_eval_distribution_metrics(uuid, text[], integer, text, uuid[], integer[])`
- `public.get_location_domain_staff_averages(uuid, timestamptz, timestamptz, boolean, uuid[], integer[], text[])`
- `public.get_location_skill_gaps(uuid, integer, integer)`
- `public.get_performance_trend(uuid, bigint, integer)`
- `public.get_evaluations_summary(uuid)` (1-arg overload)
- `public.get_evaluations_summary(uuid, boolean)` (2-arg overload)
- `public.get_best_weekly_win(uuid)`
- `public.seq_latest_quarterly_evals(uuid, bigint)`
- `public.seq_latest_quarterly_evals(integer)`
- `public.get_staff_weekly_scores(uuid, text)`
- `public.org_visible_pro_moves(uuid, integer)`
- `public.save_eval_acknowledgement_and_focus(uuid, uuid, integer[], text)` (4-arg overload only)
- `public.admin_fix_backfill_week_of()`
- `public.check_sequencer_gate(uuid, integer)`
- `public.get_resources_for_actions(bigint[], integer, uuid)`
- `public.get_pro_move_resources(bigint)`
- `public.get_materials_count(bigint[])`
- `public.get_resource_usage_summary(bigint)`
- `public.resolve_role_display_name(uuid, bigint)`
- `public.is_eligible_for_pro_moves(date, integer, date)`

**Deliberately not locked:** `public.save_eval_acknowledgement_and_focus(uuid, uuid[])`
(the 2-arg overload, `p_eval_id uuid, p_action_ids integer[]`) stays as-is.
It was already safe and is not part of this batch.

All 21 signatures were resolved live against `pg_proc` /
`pg_get_function_identity_arguments` before writing the migration, and each
one was confirmed to already be `SECURITY DEFINER` with `anon` EXECUTE
currently granted (via PUBLIC default grant).

## Apply steps

1. Run `sec2a-before.sql` against the live database (Supabase SQL Editor or
   `psql`) and confirm every row shows `anon_execute = true`.
2. Apply the migration
   `supabase/migrations/20260819232211_sec2a_revoke_anon_execute_leaking_functions.sql`
   (per `CLAUDE.md`, paste into the Supabase dashboard SQL Editor, or land on
   `main` for Lovable to pick up). The migration ends with its own `DO $$`
   assertion block, so a successful apply already proves the lockdown before
   you get here.
3. Run `sec2a-after.sql` and confirm every row now shows
   `anon_execute = false` and `authenticated_execute = true`.

Both scripts are read-only (`select` / `has_function_privilege` only) and
safe to run any time, including repeatedly.

## Batch B still outstanding

This batch only changes grants. It does **not** fix the in-body logic of the
functions that need it. Still open, tracked separately:

- **`get_staff_weekly_scores`** — anon is locked out here, but the function
  body still needs a cross-tenant check on `p_coach_user_id` so that one
  authenticated coach cannot read another org's weekly scores by supplying a
  different coach's user id.
- **`save_eval_acknowledgement_and_focus` (4-arg overload)** — anon is
  locked out here, but the body still needs a check that the calling user is
  actually allowed to write against the `p_staff_id` / `p_eval_id` it was
  given.
- **The Group 1 readers** (`get_calibration`, `get_eval_distribution_metrics`,
  `get_location_domain_staff_averages`, `get_location_skill_gaps`,
  `get_performance_trend`, `get_evaluations_summary`, `get_best_weekly_win`,
  `seq_latest_quarterly_evals`) — anon is locked out here, but none of these
  bodies were rewritten to add in-body org/tenant scoping. Locking anon
  closes the unauthenticated hole; it does not close a same-tenant
  authenticated-user-guessing-another-org's-ID hole, if one exists.

Batch A closes the "no login required" exposure. Batch B is the separate
follow-up that hardens what an authenticated caller can do with these
functions.
