# SEC-2b fix: org-vs-group id guard correction

## The bug (found by Codex, PR #34)

SEC-2b (`supabase/migrations/20260820013200_sec2b_add_caller_scope_checks.sql`,
merged to `main` but **not yet applied to the database**) added an in-body
caller-scope guard to ten `SECURITY DEFINER` functions. Eight of the ten guard
correctly. Three do not:

```sql
IF p_org_id IS DISTINCT FROM current_user_org_id()
   AND NOT EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true)
THEN RAISE EXCEPTION 'forbidden'; END IF;
```

`current_user_org_id()` always returns an **organizations.id**. But for
`get_location_domain_staff_averages`, `get_eval_distribution_metrics`, and
`seq_latest_quarterly_evals` (2-arg), the argument compared above,
`p_org_id`, is actually a **practice_groups.id** ("group" in this codebase's
current terminology, historically mis-called "organization" — see
`CLAUDE.md`'s terminology table). Each of those three function bodies filters
with `l.group_id = p_org_id`, and `locations.group_id` is a foreign key to
`practice_groups.id` (confirmed live: constraints `locations_org_fkey` /
`locations_organization_id_fkey` both read `FOREIGN KEY (group_id) REFERENCES
practice_groups(id)`). The eval-results-v2 UI sends exactly that: `FilterBar.tsx`
populates `filters.organizationId` from `.from('practice_groups')` and then
filters locations with `.eq('group_id', filters.organizationId)`.

So the guard compared a group id to an org id. For any non-super-admin caller
whose group's `organization_id` differs from the group id itself (true for
essentially every real caller, since a uuid never equals a different uuid),
the guard raised `forbidden` on every legitimate call. This broke the
eval-results-v2 org summary / location grid / location detail / export
screens (`get_eval_distribution_metrics`) and would have broken
`get_location_domain_staff_averages` and `seq_latest_quarterly_evals(uuid,
bigint)` callers the same way, once SEC-2b was applied.

## The fix

New migration:
`supabase/migrations/20260820015735_sec2b_fix_org_group_guard.sql`

For the three affected functions, the guard now resolves the group's
`organization_id` first, then compares that to `current_user_org_id()`:

```sql
IF (SELECT pg.organization_id FROM public.practice_groups pg WHERE pg.id = p_org_id) IS DISTINCT FROM public.current_user_org_id()
   AND NOT EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true)
THEN RAISE EXCEPTION 'forbidden'; END IF;
```

Everything else in each function body is verbatim from the SEC-2b version
(confirmed by diffing against `pg_get_functiondef` fetched live via read-only
Supabase MCP, and against the SEC-2b migration file itself, which uses the
same live pre-SEC-2b bodies as its base). Only the guard's comparison
changes. The other seven SEC-2b-guarded functions are untouched — see the
classification table below and reasoning for each.

For `get_eval_distribution_metrics`, the fixed guard keeps the same explicit
`public.` schema-qualification SEC-2b used, because that function's live
definition has no `SET search_path` clause (unlike its siblings).

## Classification table (how each of the 10 scoping args was verified)

Evidence column quotes the exact filter line from each function's live body
(fetched via `pg_get_functiondef` through the read-only Supabase MCP, and for
two of them cross-checked against the calling UI code).

| Function | What the scoping arg actually is | Old guard comparison | Corrected guard comparison |
|---|---|---|---|
| `get_staff_weekly_scores(uuid, text)` | Not an org check at all — `p_coach_user_id` is meant to equal the caller's own `auth.uid()`. Evidence: body resolves `p_coach_user_id` to `v_coach_staff_id` and never compares it to anything org-scoped. | `p_coach_user_id IS DISTINCT FROM auth.uid()` (+ super admin bypass) | **Unchanged — already correct.** Not touched. |
| `save_eval_acknowledgement_and_focus(uuid, uuid, integer[], text)` (4-arg) | Not an org check — ownership of the eval via `auth.uid()`. Evidence: `SELECT * INTO v_caller_staff FROM staff WHERE user_id = auth.uid();` then `v_caller_staff.id != v_eval.staff_id`. | `v_caller_staff.id != v_eval.staff_id AND NOT v_caller_staff.is_super_admin` | **Unchanged — already correct.** Not touched. (See note below on a separate, out-of-scope observation.) |
| `get_calibration(uuid, bigint, integer)` | STAFF id. Evidence: `SELECT s.primary_location_id, l.group_id ... FROM staff s ... WHERE s.id = p_staff_id` and `WHERE ws.staff_id = p_staff_id`. | `org_id_of_staff(p_staff_id) IS DISTINCT FROM current_user_org_id()` | **Unchanged — already correct.** `org_id_of_staff` resolves a staff id to its organization id correctly. Not touched. |
| `get_performance_trend(uuid, bigint, integer)` | STAFF id. Evidence: `WHERE s.id = p_staff_id` (resolving location/org) and `WHERE ws.staff_id = p_staff_id` in the query. | `org_id_of_staff(p_staff_id) IS DISTINCT FROM current_user_org_id()` | **Unchanged — already correct.** Not touched. |
| `get_best_weekly_win(uuid)` | STAFF id. Evidence: `WHERE ws.staff_id = p_staff_id`. | `org_id_of_staff(p_staff_id) IS DISTINCT FROM current_user_org_id()` | **Unchanged — already correct.** Not touched. |
| `get_evaluations_summary(uuid)` (1-arg) | STAFF id. Evidence: `WHERE e.staff_id = p_staff_id`. | `org_id_of_staff(p_staff_id) IS DISTINCT FROM current_user_org_id()` | **Unchanged — already correct.** Not touched. |
| `get_evaluations_summary(uuid, boolean)` (2-arg) | STAFF id. Evidence: `WHERE e.staff_id = p_staff_id`. | `org_id_of_staff(p_staff_id) IS DISTINCT FROM current_user_org_id()` | **Unchanged — already correct.** Not touched. |
| `get_location_domain_staff_averages(uuid, timestamptz, timestamptz, boolean, uuid[], integer[], text[])` | GROUP id (`practice_groups.id`), not an organization id. Evidence: `WHERE l.group_id = p_org_id` inside `staff_domain_agg`, and `locations.group_id` FK → `practice_groups.id`. | `p_org_id IS DISTINCT FROM current_user_org_id()` **(BUG — group id vs org id)** | `(SELECT pg.organization_id FROM practice_groups pg WHERE pg.id = p_org_id) IS DISTINCT FROM current_user_org_id()` |
| `get_eval_distribution_metrics(uuid, text[], integer, text, uuid[], integer[])` | GROUP id (`practice_groups.id`), not an organization id. Evidence: `WHERE l.group_id = p_org_id`. Cross-checked from the UI: `FilterBar.tsx` builds this value from `.from('practice_groups')` and filters locations by `.eq('group_id', filters.organizationId)`. | `p_org_id IS DISTINCT FROM current_user_org_id()` **(BUG — group id vs org id)** | `(SELECT pg.organization_id FROM practice_groups pg WHERE pg.id = p_org_id) IS DISTINCT FROM current_user_org_id()` |
| `seq_latest_quarterly_evals(uuid, bigint)` (2-arg overload) | GROUP id (`practice_groups.id`), not an organization id. Evidence: `WHERE l.group_id = p_org_id`. | `p_org_id IS DISTINCT FROM current_user_org_id()` **(BUG — group id vs org id)** | `(SELECT pg.organization_id FROM practice_groups pg WHERE pg.id = p_org_id) IS DISTINCT FROM current_user_org_id()` |

No scoping arg was ambiguous or "left as unsure" — all ten were resolvable
from the live body (and, for the two UI-called functions among the three
fixed, corroborated from the caller side too).

## Overlap with COR-2

COR-2 tracks the broader org-vs-group id confusion in DB functions. These
three functions —`get_location_domain_staff_averages`,
`get_eval_distribution_metrics`, `seq_latest_quarterly_evals` (2-arg
overload) — are instances of exactly that confusion (a parameter named
`p_org_id` that is actually a `practice_groups.id`) and this fix only patches
the new SEC-2b guard, not the parameter naming itself. COR-2 should consider
whether to rename `p_org_id` to something like `p_group_id` in these three
signatures for clarity, and whether any *other* function in the codebase
(outside the ten SEC-2b touched) has the same `p_org_id`-is-really-a-group-id
naming trap. That sweep is out of scope here.

## Not fixed here, flagged for a separate ticket

`save_eval_acknowledgement_and_focus(uuid, uuid, integer[], text)` (4-arg)
takes `p_staff_id` as a separate argument from `p_eval_id`, and its guard
(unchanged by this fix, ported correctly from SEC-2b) authorizes based on
`p_eval_id` ownership only — it does not check that `p_staff_id` matches
`v_eval.staff_id`. A caller who owns their own eval could in principle pass a
different `p_staff_id` and write a `staff_quarter_focus` row attributed to
someone else, tied to their own eval id. This was already flagged in
SEC-2b's own README (`scripts/sec-verification/sec2b-README.md`) and is
reconfirmed here, not fixed — it is a different bug (missing arg
cross-check) from the one this migration addresses (wrong id-type
comparison), and fixing it would mean changing what the function does with
`p_staff_id`, not just correcting a guard.

## Runtime verification (supervised, after apply)

This cannot be checked from SQL alone in the migration — it needs two real
logged-in sessions (`auth.uid()` context), so it's a manual step after a
human applies the migration.

1. **Apply order.** This fix migration must be applied *after*
   `20260820013200_sec2b_add_caller_scope_checks.sql` (it replaces functions
   SEC-2b already replaces). If both are still unapplied, apply them in
   filename order — the timestamp on this file already sorts after SEC-2b's.
2. **Legitimate org admin call should now succeed.** Log in as a real
   non-super-admin admin/coach account tied to one group, and load the
   eval-results-v2 screens that call `get_eval_distribution_metrics`
   (`OrgSummaryStrip`, `LocationCardGrid`, `LocationDetailV2`,
   `EvaluationsExportTab`) with that account's own group selected. Confirm
   data loads instead of a `forbidden` error. Repeat by calling
   `get_location_domain_staff_averages` and `seq_latest_quarterly_evals(p_org_id,
   p_role_id)` directly via `supabase.rpc(...)` in the browser console (or SQL
   Editor with `SET request.jwt.claims` / as that user) with that account's
   own group id.
3. **Cross-group call should still raise forbidden.** With the same account,
   call the same three functions passing a *different* group's id (one
   belonging to a different organization than the caller's). Confirm each
   still raises `forbidden` — the fix must not have widened access, only
   corrected which id gets compared.
4. **Same-org, different-group call should succeed if that's the intended
   scope.** If two groups share the same `organization_id` (multi-group
   orgs), a caller in group A should now be able to query group B's data via
   these functions, since the guard compares organization id, not group id.
   Confirm this matches product intent (it mirrors what `current_user_org_id()`
   already grants everywhere else) — flag to product if a group-level
   boundary was actually intended instead of an org-level one.
5. **Super admin is not blocked.** Confirm a super admin account can call all
   three functions with any group id and does not hit `forbidden`.
