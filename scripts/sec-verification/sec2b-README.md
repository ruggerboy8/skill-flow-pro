# SEC-2 batch B verification

What batch B does: adds an authorization check inside the body of ten
`SECURITY DEFINER` function signatures so that an *authenticated* caller
cannot read another tenant's data, or write against another user's
evaluation, by supplying a foreign id. Batch A (separate branch,
`fix/sec-2a-lock-anon-functions`, not yet merged) revokes anon/PUBLIC
EXECUTE on these same functions. Batch A closes the "no login required"
hole; batch B closes the "logged in, but supplied someone else's id" hole
underneath it. Neither batch has been applied to the database.

Migration:
`supabase/migrations/20260820013200_sec2b_add_caller_scope_checks.sql`

Every statement in the migration is `CREATE OR REPLACE FUNCTION` with the
exact live body (fetched via `pg_get_functiondef` through the read-only
Supabase MCP, immediately before writing this migration) reproduced
verbatim, with only a guard block prepended at the top of the body. No
query logic, return type, signature, or `SECURITY DEFINER` setting was
changed in any of the ten. Each function's `prosecdef`, identity arguments,
and `pg_get_functiondef` output were confirmed live before writing its
replacement.

## How I confirmed nothing else changed

For each function I diffed the fetched `pg_get_functiondef` output against
what I wrote, statement by statement, and confirmed:
- Same `RETURNS` clause (table shape or scalar type), byte-for-byte.
- Same `LANGUAGE`, same `STABLE`/`VOLATILE` (no keyword = default volatile,
  preserved as no keyword), same `SECURITY DEFINER`, same (or absent)
  `SET search_path` clause -- one function, `get_eval_distribution_metrics`,
  has no `SET search_path` in its live definition, and that absence is
  preserved rather than "fixed."
- Same parameter list and defaults, in the same order.
- The only inserted text is the guard block (and, for the one function
  that had no `DECLARE` section, a new `DECLARE` block to hold the two
  variables the guard needs).

After this migration is applied (a later, supervised step, not done by
this branch), each function's `prosecdef` and identity arguments can be
re-verified live with:

```sql
select p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = '<name>';
```

The migration's own trailing `DO $$` block already asserts this
(existence + `prosecdef = true`) for all ten signatures and fails the
migration if any check does not hold.

## Functions changed (10)

### 1. `get_staff_weekly_scores(uuid, text)`

`p_coach_user_id` is documented as the caller's own identity, but the body
never checked that -- any authenticated user could pass a different real
coach's `user_id` and receive that coach's full roster (names, scores,
confidence/performance data). Confirmed by reading the body: the function
resolves `p_coach_user_id` into `v_coach_staff_id` and checks that *that*
person has coach/admin-style privileges, but never compares
`p_coach_user_id` to the caller.

Guard added (first statement in the body, matches the spec's suggested
text):

```sql
IF p_coach_user_id IS DISTINCT FROM auth.uid()
   AND NOT EXISTS (
     SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true
   )
THEN
  RAISE EXCEPTION 'forbidden: cannot query another user''s roster';
END IF;
```

Super admins are exempt (matches the ticket's instruction and the
function's own existing `v_is_super_admin` handling further down).

### 2. `save_eval_acknowledgement_and_focus(uuid, uuid, integer[], text)` -- 4-arg overload only

This overload updates `evaluations` and rewrites `staff_quarter_focus` rows
with **no caller check whatsoever** -- not even confirmation the caller has
a staff record. The 2-arg overload,
`save_eval_acknowledgement_and_focus(uuid, integer[])`, already has the
correct guard. That guard is ported verbatim into the 4-arg body (the 4-arg
body had no `DECLARE` section, so one was added to hold the two variables):

```sql
DECLARE
  v_eval evaluations%ROWTYPE;
  v_caller_staff staff%ROWTYPE;
BEGIN
  SELECT * INTO v_eval FROM evaluations WHERE id = p_eval_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;

  SELECT * INTO v_caller_staff FROM staff WHERE user_id = auth.uid();
  IF v_caller_staff.id IS NULL THEN RAISE EXCEPTION 'No staff record'; END IF;

  IF v_caller_staff.id != v_eval.staff_id AND NOT v_caller_staff.is_super_admin THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT v_eval.is_visible_to_staff THEN RAISE EXCEPTION 'Evaluation not visible'; END IF;
```

Caller must own the eval (`eval.staff_id = caller.id`) or be a super admin,
and the eval must be visible to staff (`is_visible_to_staff`, the same flag
the 2-arg overload checks). The original write logic (update, delete,
insert) is untouched below this guard.

**The 2-arg overload was not touched.**

**Left as a latent inconsistency, not fixed here (scope creep):** the 4-arg
overload takes `p_staff_id` as a separate argument from `p_eval_id`, and
the guard above authorizes based on `p_eval_id` ownership only -- it does
not check that `p_staff_id` matches `v_eval.staff_id`. A caller who owns
their own eval could in principle pass a different `p_staff_id` and write a
focus row attributed to someone else, tied to their own eval id. The spec
for this batch said to port the 2-arg's guard exactly and not alter query
logic; fixing that would mean changing what the function does with
`p_staff_id`, not just adding a guard. Flagging this for a separate ticket
rather than fixing it here.

### 3-10. Group 1 readers (8 of the 10 signatures listed in the ticket)

Guard style copied from the existing `public.get_staff_domain_avgs`
function (the `IF ... THEN RAISE EXCEPTION 'forbidden'; END IF;` shape).
Each compares the function's scoping argument's org to the caller's org,
using the existing helpers `org_id_of_staff(uuid)`, `org_id_of_location`
(not needed by any function in this batch after `get_location_skill_gaps`
was excluded, see below), and `current_user_org_id()`, and exempts super
admins:

```sql
-- staff-id-scoped functions
IF public.org_id_of_staff(p_staff_id) IS DISTINCT FROM public.current_user_org_id()
   AND NOT EXISTS (
     SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true
   )
THEN
  RAISE EXCEPTION 'forbidden';
END IF;

-- org-id-scoped functions
IF p_org_id IS DISTINCT FROM public.current_user_org_id()
   AND NOT EXISTS (
     SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true
   )
THEN
  RAISE EXCEPTION 'forbidden';
END IF;
```

| # | Function | Scoping arg | Guard form |
|---|---|---|---|
| 3 | `get_calibration(uuid, bigint, integer)` | `p_staff_id` | `org_id_of_staff` |
| 4 | `get_performance_trend(uuid, bigint, integer)` | `p_staff_id` | `org_id_of_staff` |
| 5 | `get_best_weekly_win(uuid)` | `p_staff_id` | `org_id_of_staff` |
| 6 | `get_evaluations_summary(uuid)` (1-arg) | `p_staff_id` | `org_id_of_staff` |
| 7 | `get_evaluations_summary(uuid, boolean)` (2-arg) | `p_staff_id` | `org_id_of_staff` |
| 8 | `get_location_domain_staff_averages(uuid, timestamptz, timestamptz, boolean, uuid[], integer[], text[])` | `p_org_id` | direct compare |
| 9 | `get_eval_distribution_metrics(uuid, text[], integer, text, uuid[], integer[])` | `p_org_id` | direct compare |
| 10 | `seq_latest_quarterly_evals(uuid, bigint)` (2-arg overload) | `p_org_id` | direct compare |

For #9, `get_eval_distribution_metrics`, the guard schema-qualifies
`public.staff` / `public.current_user_org_id()` explicitly because that
function's live definition has no `SET search_path` clause (unlike its
siblings), so it cannot be assumed to resolve unqualified names to
`public`. Nothing else about that function's definition was changed to
"fix" the missing `SET search_path` -- that is out of scope for this
ticket.

## Left out of this migration (2) -- needs manual review

### `get_location_skill_gaps(uuid, integer, integer)`

In scope per the ticket (scoping arg is `p_location_id`, and
`org_id_of_location` exists and would resolve it cleanly), but its live
definition is `LANGUAGE sql`, not `plpgsql` -- the body is a single
`WITH ... SELECT` statement with no `BEGIN`/`END` and no control-flow
construct available to raise a clean, message-bearing exception. Adding a
guard here would require either:

- converting the function to `LANGUAGE plpgsql` (wrapping the identical
  query in `BEGIN ... RETURN QUERY <query>; END;`) so an `IF ... RAISE
  EXCEPTION` guard has somewhere to live, or
- folding the org check into the query's `WHERE` clause instead of raising,
  which silently returns zero rows for an unauthorized caller instead of
  an explicit `forbidden` error.

Both of those are a larger change to the function's structure than "prepend
a guard block," which the ticket said not to do without being sure. I did
not invent either approach here. Recommendation: a follow-up either
explicitly approves the `LANGUAGE sql` -> `plpgsql` conversion (low risk,
mechanical, verifiable query-for-query) or approves the `WHERE`-clause
version, then applies whichever guard as its own small, reviewable change.

### `seq_latest_quarterly_evals(integer)` -- 1-arg overload

Signature is `seq_latest_quarterly_evals(role_id_arg integer)`. Its only
argument is a role id, with **no staff id, org id, or location id anywhere
in the signature or body** -- the query groups by `competency_id` across
*all* organizations' submitted quarterly evaluations for that role, with no
tenant predicate at all. There is no argument to scope a same-org check
against, so per the ticket's own instruction ("If a function's scoping arg
is ambiguous or it has no usable org linkage, DO NOT invent a guard --
leave that function OUT"), this one is left out. This function is also
`LANGUAGE sql`, which would independently block the same guard-shape used
elsewhere, but the primary reason it's excluded is that there is nothing to
scope against. This function returning cross-org aggregate scores (not
individual names/PII, just averaged competency scores) to any authenticated
caller is worth a separate look -- flagging, not fixing.

## Apply steps (later, supervised)

1. Confirm batch A (`fix/sec-2a-lock-anon-functions`) is merged and applied
   first, or apply both together -- batch B alone does not change grants,
   so if applied without batch A, `anon` would still be able to call these
   functions (and would immediately hit the new `forbidden` exception on
   every one, since an anonymous caller matches none of the guards). That
   is a safe failure mode (it fails closed), but batch A is still the
   correct fix for the anon-access problem and should not be skipped.
2. Apply the migration
   `supabase/migrations/20260820013200_sec2b_add_caller_scope_checks.sql`
   (per `CLAUDE.md`: paste into the Supabase dashboard SQL Editor, or land
   on `main` for Lovable to pick up). Its trailing `DO $$` block fails the
   migration if any of the ten signatures is missing or lost
   `SECURITY DEFINER`.
3. Manually verify with two real accounts in different orgs (or two coaches
   in the same org vs. different orgs) that:
   - A coach can still load their own dashboard / roster / eval summaries
     normally (no false-positive `forbidden`).
   - Calling any of the ten functions with another org's staff/org/location
     id (or another coach's `user_id` for `get_staff_weekly_scores`) now
     raises `forbidden` instead of returning data.
   - A super admin account is not blocked by any of the ten guards.

This cannot be asserted from SQL alone in the migration itself (that needs
different `auth.uid()` contexts, i.e. real logged-in sessions), which is
why the migration's own sanity block only checks existence and
`SECURITY DEFINER`, not runtime behavior.
