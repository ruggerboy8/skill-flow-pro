# Spec: SEC-1, anon-read regression guard

**Status:** built, live-verified against production
**Lane:** security
**Ticket:** SEC-1 follow-up (Motion, MyProMoves Dev Board)
**Branch:** feature/sec-1-anon-read-guard

## What and why

SEC-1 closed an unauthenticated read surface: any anonymous caller (no login,
just the public anon key) could read employee names, personal emails and
performance scores across all four tenants. It was fixed on production on
2026-08-18 via two migrations:

- `supabase/migrations/20260819021638_sec1_close_anon_read_surface.sql`
- `supabase/migrations/20260819021706_sec1_revoke_function_execute_from_public.sql`

That exposure had reverted three times before this fix, because the fix is a
set of Postgres GRANT/REVOKE statements with no code-level enforcement, and
nothing caught a later migration quietly reopening one of them. The second
migration above records the exact mechanism: the first attempt revoked
EXECUTE from `anon` specifically, which did nothing, because Postgres grants
EXECUTE to `PUBLIC` by default and `anon` inherits it. A CREATE OR REPLACE
FUNCTION with a changed signature makes a brand-new function object, which
gets that default PUBLIC grant back even if the old signature was locked
down. This is exactly the shape of regression that is easy to introduce by
accident in a routine schema change and easy to miss in review, since
nothing about the SQL of a normal `CREATE OR REPLACE FUNCTION` looks
dangerous on its own.

This ticket does not change anything about the closed surface. It adds a
test that behaves like an anonymous attacker and fails loudly if the surface
reopens, run on a schedule so a silent revert gets caught within a day
instead of during the next live audit.

## The guard

`src/security/anonReadSurface.test.ts` is a Vitest test that:

1. Builds a fresh Supabase client using only the public URL and anon
   (publishable) key already committed in
   `src/integrations/supabase/client.ts` - no secrets, `persistSession:
   false` so it never carries a real session.
2. For every view/table SEC-1 closed, attempts an anon `.select()` and
   asserts the read is refused: either a permission error, or (if some
   future change makes it return no error) zero rows. Real data is never an
   acceptable outcome.
3. For every SECURITY DEFINER function SEC-1 revoked EXECUTE from, attempts
   an anon `.rpc()` call and asserts the same.
4. Runs one **positive control** RPC that is genuinely anon-callable today
   (`seq_latest_quarterly_evals`, aggregate competency scores, no PII) and
   asserts it still succeeds. This is what proves the other assertions are
   discriminating a closed surface from a dead network or a bad key, not
   just failing uniformly.
5. Skips itself (log a message, no failure) unless `RUN_LIVE_SECURITY_TESTS`
   is set, or if the Supabase host turns out to be unreachable at run time.
   This keeps it out of the way locally and in `npm run check`, while still
   running for real in CI.

The closed inventory lives as two exported arrays, `CLOSED_RELATIONS` and
`CLOSED_FUNCTIONS`, specifically so a later ticket (SEC-2) can extend the
list without touching the test logic.

### Closed inventory this guard checks

**Views (security_invoker + anon SELECT revoked):**
- `view_evaluation_items_enriched`
- `view_weekly_scores_with_competency`
- `view_staff_submission_windows`

**Tables (RLS enabled, no policies, all privileges revoked from anon/authenticated):**
- `eval_payload_recovery_backup`
- `_eval_repair_targets`

**Functions (EXECUTE revoked from PUBLIC and anon; granted only to authenticated, service_role):**
- `get_staff_all_weekly_scores(uuid)`
- `get_staff_submission_windows(uuid, date)`
- `get_coach_roster_summary(uuid, date)`
- `get_calendar_week_status(uuid, integer)`
- `compute_eval_self_scores(uuid)`
- `compute_eval_participation_snapshot(uuid)`
- `get_strengths_weaknesses(uuid, uuid[], integer[], text[], timestamptz, timestamptz)`
- `compare_conf_perf_to_eval(uuid, integer, uuid[], integer[], text[], timestamptz, timestamptz)`

**Positive control:**
- `seq_latest_quarterly_evals(uuid, bigint)` - returns aggregate,
  non-identifying competency scores; used by the sequencer/recommender.

## Two run paths

1. **Nightly, against production** -
   `.github/workflows/security-guard.yml` runs on a cron schedule (09:00
   UTC daily) plus `workflow_dispatch` for an on-demand run. It runs only
   this one test file with `RUN_LIVE_SECURITY_TESTS=1`. A failed run is the
   signal - it means the closed surface may have reopened and needs a live
   check.
2. **On PRs, in CI** - `ci.yml` was intentionally left unchanged by this
   ticket, so PR checks stay exactly as fast and offline as they are today
   (the test skips itself there since `RUN_LIVE_SECURITY_TESTS` isn't set).
   If a PR-time run against production is wanted later, the smallest change
   is adding `RUN_LIVE_SECURITY_TESTS: '1'` to the existing `npm test` step
   in `ci.yml` - noted here rather than done, since that would make every
   PR's CI run depend on production network reachability, which is a
   different tradeoff than this ticket's scope.

## SEC-2

Any future object that needs the same anon-read protection (existing or
new) should be added to `CLOSED_RELATIONS` or `CLOSED_FUNCTIONS` in
`src/security/anonReadSurface.test.ts`, not folded into a new test file.

## Verification (2026-08-19)

Ran `RUN_LIVE_SECURITY_TESTS=1 npx vitest run
src/security/anonReadSurface.test.ts` against production: 14/14 passed (5
relations + 8 functions + 1 positive control), confirming the SEC-1 surface
is closed today and that the positive control still succeeds. Also
confirmed with `curl` directly against the REST API that every closed
object returns `42501 permission denied` (HTTP 401) for anon, and that
`seq_latest_quarterly_evals` returns `200` with real (aggregate) output.

Ran the same test with no env var set: it skips all 14 assertions in ~3ms
and the file still reports as passed, so `npm run check` stays green either
way.
