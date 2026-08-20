# Spec: SEC-2, lock anon-callable SECURITY DEFINER functions

**Status:** batch A built
**Lane:** security
**Ticket:** SEC-2 (Motion, MyProMoves Dev Board)
**Branch:** fix/sec-2a-lock-anon-functions (batch A)

## What and why

`public` has roughly 85 `SECURITY DEFINER` functions. SECURITY DEFINER means a
function runs with its owner's privileges, not the caller's, so it bypasses
RLS by design; the only thing standing between an anonymous internet caller
and the data is whether that caller has EXECUTE. Of the 85, 57 currently have
EXECUTE available to `anon`, because Postgres grants EXECUTE on functions to
PUBLIC by default and `anon` inherits it unless a migration explicitly
revokes it. This was found the same way SEC-1 was: verified live, not
inferred from code, by two independent reviewers who ran the queries.

The functions in this exposure include reporting functions that return
employee names, scores, and coaching data, and at least two functions that
perform writes, all callable with no login. Several call sites pass a
caller-supplied ID (a staff id, a coach user id) straight into the query with
no check that the ID belongs to the caller, which the SEC-1/SEC-2 assessment
flagged as a second, deeper problem sitting underneath the anon-access one:
even once anon is locked out, an authenticated user might still be able to
read another org's data by supplying someone else's ID. `get_staff_weekly_scores`
is the clearest example: it takes `p_coach_user_id` as a plain argument with
no ownership check in the body.

That second problem is not a grants problem, it is a function-body problem,
and fixing it means rewriting logic, not just revoking a privilege. Mixing
the two changes in one migration would make the diff harder to verify and
harder to roll back independently. So SEC-2 is split into batches that ship
and get verified separately.

## The three batches

**Batch A (this branch, built).** Revoke anon/PUBLIC EXECUTE, re-grant to
`authenticated` and `service_role`, on every function confirmed to leak data
or accept writes from an anonymous caller and confirmed to have no
authenticated-context call site that would break. No function body changes.
This is the same shape as SEC-1's function-grant fix
(`20260819021706_sec1_revoke_function_execute_from_public.sql`): a
role-only revoke does nothing, the revoke has to include PUBLIC.

**Batch B (separate ticket, not started).** Add the missing in-body
cross-tenant checks, starting with `get_staff_weekly_scores` (verify the
calling user is actually the coach named by `p_coach_user_id`, or is an
admin) and the 4-arg `save_eval_acknowledgement_and_focus` (verify the
calling user may write against the `p_staff_id` / `p_eval_id` given). This
batch touches function bodies and needs its own review and test pass,
because a wrong scoping check can either leave the hole open or break a
legitimate coach's own dashboard.

**Batch C (deliberately left alone).** 16 functions that are called from
inside RLS policies themselves (`is_super_admin`, `is_admin`,
`is_coach_or_admin`, `is_clinical_or_admin`, `is_office_manager_for_location`,
`is_same_org_eval`, `is_assigned_doctor_coach`, `is_org_allowed_for_sequencing`,
`org_id_of_staff`, `org_id_of_location`, `get_user_org_id`,
`get_staff_id_for_user`, `get_my_coach_staff_ids`,
`coach_baseline_exists_for_doctor`, `has_survey_assignment`,
`is_survey_admin_for`). Revoking anon EXECUTE on these would break live
anonymous-context RLS evaluation paths that legitimately need to run before a
session is established. These stay as they are; they were confirmed to be
predicate functions, not data-returning endpoints, and are out of scope for
SEC-2 entirely.

**Only about 15 of the roughly 85 SECURITY DEFINER functions had their
bodies actually read** during the original assessment; the rest were
screened for auth references only. There may be more unguarded functions
than this ticket's 57-function inventory lists. That is a scope note for a
future pass, not something batch A tries to cover.

## Batch A: what got locked

21 function signatures across 19 names (three names are overloaded):

- `get_calibration`, `get_eval_distribution_metrics`,
  `get_location_domain_staff_averages`, `get_location_skill_gaps`,
  `get_performance_trend`, `get_evaluations_summary` (both the 1-arg and
  2-arg overloads), `get_best_weekly_win`, `seq_latest_quarterly_evals`
  (both overloads) — reporting functions returning names, scores, and
  coaching data to whoever calls them with no login.
- `get_staff_weekly_scores` — locked for anon access in this batch; its
  missing in-body cross-tenant check is batch B, not this migration.
- `org_visible_pro_moves` — its only real caller is `sequencer-rank` on the
  service-role client, which keeps EXECUTE, so locking anon is safe.
- `save_eval_acknowledgement_and_focus`, 4-arg overload only (the app calls
  it as `authenticated` from `EvaluationReviewV2.tsx`). The 2-arg overload
  was already safe and is deliberately left alone.
- `admin_fix_backfill_week_of` — a write function with no anon call site.
- Group 3, lower-sensitivity but locked anyway for consistency:
  `check_sequencer_gate`, `get_resources_for_actions`,
  `get_pro_move_resources`, `get_materials_count`,
  `get_resource_usage_summary`, `resolve_role_display_name`,
  `is_eligible_for_pro_moves`.

Every signature was resolved live against `pg_proc` /
`pg_get_function_identity_arguments` before writing the migration (several
of these names are overloaded, so an untyped `revoke execute on function
foo` is ambiguous or fails), and each one was confirmed to be
`SECURITY DEFINER` with `anon` currently able to EXECUTE it via the PUBLIC
default grant. All 19 names in scope existed and matched; none were skipped.

Migration:
`supabase/migrations/20260819232211_sec2a_revoke_anon_execute_leaking_functions.sql`.
It ends with its own `DO $$` assertion block that fails the migration if any
targeted function still grants anon EXECUTE, or if `authenticated` lost it.

Verification scripts (read-only, not applied by the migration itself):
`scripts/sec-verification/sec2a-before.sql`,
`scripts/sec-verification/sec2a-after.sql`,
`scripts/sec-verification/sec2a-README.md`.

## Guard

The longer-term fix for "this keeps coming back" is a CI check that fails
whenever a new or changed function grants EXECUTE to `anon` without an
explicit, reviewed exception. SEC-1's regression trail (the anon-readable
view fix was reverted three separate times by later migrations that didn't
know it existed) is why a one-time migration isn't enough on its own. That
guard is not part of batch A; it is tracked as its own follow-up alongside
GOV-3.

## Not in scope for batch A

- No function body changes (batch B).
- No changes to the 16 Group 7 RLS-predicate functions (batch C, deliberately
  skipped).
- No schema drops, no deletes, no app code changes.
- Not applied to the database by this branch. The migration is applied later
  in a supervised step, verified with the before/after scripts in
  `scripts/sec-verification/`.
