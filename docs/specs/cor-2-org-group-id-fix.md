# Spec: COR-2, org-id vs group-id confusion in database functions

**Status:** migration written, not applied
**Lane:** correctness
**Ticket:** COR-2 (Motion, MyProMoves Dev Board)
**Branch:** fix/cor-2-org-group-id-functions
**Migration:** `supabase/migrations/20260820023000_cor2_fix_org_group_id_confusion.sql`

## What and why

The hierarchy is Organization (`organizations`, added 2026-03-06) → Group
(`practice_groups`, the OLD thing this codebase used to call "org") →
Location (`locations`, `locations.group_id` FKs to `practice_groups.id`) →
Staff. A lot of shipped SQL still uses `p_org_id` / `org_id` names for values
that are actually group ids, and in a smaller number of confirmed places for
values that are actually organization ids. Because both are UUIDs, a mismatch
between the two doesn't error, it just matches nothing and returns zero rows.

This ticket covers three things: (1) the specific functions named in the
COR-2 finding, verified one at a time against live data rather than assumed;
(2) the two competing org resolvers, `current_user_org_id()` (has a fallback)
and `get_user_org_id(uuid)` (didn't); (3) missing trigger coverage so
`staff.organization_id` goes stale when a location or practice group is
re-parented.

## A note on method

The original assessment's COR-2 line named five functions plus
`get_coach_roster_summary` and `is_org_allowed_for_sequencing` as affected,
and asserted that `filters.organizationId` (the caller in
`OrgSummaryStrip.tsx:42`) is "a REAL organization id." That assertion turned
out to be wrong, caught by checking the caller rather than trusting the
ticket text: `FilterBar.tsx` (the component that actually owns and populates
`filters.organizationId` for the whole eval-results filter set, including
`OrgSummaryStrip`) queries `practice_groups`, not `organizations`, and stores
`practice_groups.id` into `filters.organizationId`. So for that caller,
`p_org_id` genuinely is a group id, and the functions that filter with
`l.group_id = p_org_id` are internally self-consistent, not broken.

This was independently re-discovered mid-week by SEC-2b's own fix migration
(`20260820015735_sec2b_fix_org_group_guard.sql`, written before this ticket
was picked up, same finding, same evidence). Rather than redo that work, this
migration builds on it: three of the five originally-named functions needed
no further change here. The other two named functions and the two functions
not in SEC-2b's list turned out to need genuine fixes once checked against
live data. Details per function below.

## Per-function findings

### Not touched by this migration (verified correct as-is)

**`get_eval_distribution_metrics`, `get_location_domain_staff_averages`,
`seq_latest_quarterly_evals(uuid, bigint)`.** SEC-2b added a guard comparing
`p_org_id` to `current_user_org_id()` directly; SEC-2b's own fix migration
corrected that guard to resolve `p_org_id` through `practice_groups.id ->
organization_id` first. The function bodies' `WHERE l.group_id = p_org_id`
join logic was checked (by SEC-2b's fix, and re-confirmed here) and is
correct: `p_org_id` really is a group id end to end, caller included. **Live
DB currently has neither the original SEC-2b guard nor the fixed one** -- the
guard code was never applied (see Ground truth vs. live section below). This
migration does not redefine these three; SEC-2b's fix migration already has
the right body queued ahead of this one.

**`get_staff_domain_avgs`, `get_strengths_weaknesses`.** Same self-consistent
pattern: both filter with a group-id column (`l.group_id` /
`view_evaluation_items_enriched.group_id`, and that view has no
`organization_id` column at all -- checked live). Neither has a live caller
anywhere in `src/` or `supabase/functions/` (grepped, only hit is
`src/integrations/supabase/types.ts` generated types and the SEC-1 regression
test list). With no caller to contradict the group-id reading and a body
that's internally consistent, there's no verified bug to fix. Their existing
"super-admin only" guard is SEC-1's anon-lock (protected by
`src/security/anonReadSurface.test.ts`) and changing that guard's behavior
was never asked for and is out of scope here.

**`current_user_org_id()`.** Already correct
(`COALESCE(staff.organization_id, locations -> practice_groups.organization_id)`).
Not modified; `get_user_org_id` below is rewritten to match it.

### Fixed by this migration

**`get_coach_roster_summary(uuid, date)`.** Body compares
`wa.org_id = l2.group_id`. Verified live:
`weekly_assignments.org_id`, when non-null (334 of 1,414 rows), matches
`organizations.id` for all 334 and `practice_groups.id` for none. So this
comparison was real-org-id-against-group-id, always false for every
org-scoped assignment -- those assignments silently dropped out of every
coach's roster summary, leaving only location-scoped or fully-global
assignments visible. Fix: resolve the staff's location through
`practice_groups.organization_id` before comparing, same pattern
`current_user_org_id()` uses.

**`is_org_allowed_for_sequencing(uuid)`.** Looks `p_org_id` up directly in
`practice_groups.id`. Its only real callers are two RLS policies (on
`sequencer_runs.org_id` and the archived `zzz_archived_weekly_plan.org_id`),
gating columns that share the exact naming and write path as
`weekly_assignments.org_id` (same sequencer machinery, same "populate org_id
with the caller's real organization id" pattern traced through
`AdminBuilder.tsx` → `useUserRole().organizationId` →
`PlannerWorkspace`/`WeekBuilderPanel` → `sequencer-auto-assign`). Fix: check
`practice_groups.organization_id = p_org_id` instead of
`practice_groups.id = p_org_id`. `organizations` has no `active` column of
its own (checked live schema), so the "must have an active group" gate stays
on `practice_groups`, just resolved through the correct FK direction.

**`get_user_org_id(uuid)`.** Retained, not dropped -- RLS policies on
`weekly_assignments`, `practice_groups`, `locations`, `weekly_scores`,
`organization_pro_moves`, `organization_pro_move_overrides`, and
`organization_pro_move_content_overrides` all call
`get_user_org_id(auth.uid())` directly in `USING`/`WITH CHECK` (confirmed
live via `pg_policy`). Old body: `INNER JOIN staff -> locations ->
practice_groups`, no fallback. Verified live: 8 staff have
`primary_location_id IS NULL`, and all 8 of those already have
`staff.organization_id` set directly (0 staff have both null). The old
`get_user_org_id` ignored `staff.organization_id` entirely and returned NULL
for those 8, meaning every RLS policy gated by `org_id = get_user_org_id(...)`
denied them -- no weekly assignments, no visible practice group, nothing.
Fix: same `COALESCE(staff.organization_id, location-chain)` fallback as
`current_user_org_id()`, generalized to the passed-in user id.

### Trigger coverage

Verified live: no triggers currently exist on `locations` or
`practice_groups` that touch `staff.organization_id` (checked
`pg_trigger`). The only sync mechanism, `trg_staff_fill_organization_id` /
`staff_fill_organization_id()`, only fires on `staff` row changes
(`INSERT`/`UPDATE OF primary_location_id, organization_id`) and only fills
when `organization_id IS NULL` -- it never re-derives an already-set value.
So re-parenting a location to a different group, or a group to a different
organization, leaves every affected staff row's `organization_id` stale.
Verified live: 0 staff currently have a mismatched `organization_id` (cross-
checked every staff row's stored `organization_id` against the value derived
fresh from their location chain) -- the risk is structural, not a live data
bug today, exactly as the ticket said.

Added two `AFTER UPDATE` triggers that resync affected staff rows:
`trg_sync_staff_org_on_location_reparent` (fires `AFTER UPDATE OF group_id ON
locations`, updates every staff row whose `primary_location_id` is that
location) and `trg_sync_staff_org_on_group_reparent` (fires `AFTER UPDATE OF
organization_id ON practice_groups`, updates every staff row whose location
belongs to that group). Both compute the value the same way
`staff_fill_organization_id()` does.

**Decision made without a spec answer, flagged for QA:** these triggers
unconditionally overwrite `staff.organization_id` for every affected staff
row, not just ones where the current value happens to equal the pre-reparent
derived value. There's no column or flag anywhere that distinguishes "this
staff row's organization_id was derived from its location" from "someone set
it independently of location for a deliberate reason," and 0 live mismatches
today means there's no existing case to learn the distinction from either.
Given `current_user_org_id()` already treats `staff.organization_id` as the
authoritative value (falling back to the location chain only when it's
NULL), and the sync trigger for `staff` row changes fills it the same way,
unconditional resync-on-reparent is the consistent continuation of that
existing design. If any staff member is ever meant to carry an
organization_id independent of their location, this would silently overwrite
it -- flagging that as an open question for QA/product, not something this
migration can resolve on its own.

## Ground truth vs. live database (as of 2026-08-19/20)

Read-only `mcp__claude_ai_Supabase__execute_sql` access to project
`yeypngaufuualdfzcjpk` worked for the whole investigation -- no repo-only
fallback was needed.

The live database currently has **neither** SEC-2a's grant revocations'
matching guard bodies **nor** SEC-2b's caller-scope guards applied to three
functions, in a mixed, partially-applied state:

| Function | Live grants (anon?) | Live guard in body |
|---|---|---|
| `get_eval_distribution_metrics` | No anon (SEC-2a grants applied) | No guard at all (SEC-2b body not applied) |
| `get_location_domain_staff_averages` | No anon | No guard at all |
| `seq_latest_quarterly_evals(uuid,bigint)` | No anon | No guard at all |
| `get_staff_domain_avgs` | **Has anon** (not in SEC-2a's 19-name list) | Super-admin-only (SEC-1) |
| `get_strengths_weaknesses` | **Has anon** | Super-admin-only (SEC-1) |
| `get_coach_roster_summary` | No anon | Own coach-scope check, unrelated to SEC-2 |
| `is_org_allowed_for_sequencing` | Has anon (batch C, intentional) | n/a (predicate) |
| `get_user_org_id` | Has anon (batch C, intentional) | n/a (predicate) |
| `current_user_org_id` | Has anon | n/a (predicate) |

So SEC-2a's grant revokes appear to have already been applied to the three
functions it targets among this set; SEC-2b's body/guard changes (both the
original and the fix) have not. This migration's bodies for
`get_coach_roster_summary` and `is_org_allowed_for_sequencing` are new work,
not affected by that discrepancy. It does not touch the three functions
SEC-2b guards, for the reasons above.

## Verification queries and results

**`weekly_assignments.org_id` -- organization id or group id?**

```sql
select
  count(*) filter (where org_id is null) as null_org_id,
  count(*) filter (where org_id is not null) as non_null_org_id,
  count(*) filter (where org_id is not null and exists (
    select 1 from organizations o where o.id = weekly_assignments.org_id
  )) as matches_organizations_id,
  count(*) filter (where org_id is not null and exists (
    select 1 from practice_groups pg where pg.id = weekly_assignments.org_id
  )) as matches_practice_groups_id
from weekly_assignments;
```

Result: `null_org_id: 1080, non_null_org_id: 334, matches_organizations_id: 334,
matches_practice_groups_id: 0`. **Verdict: real organization id, unanimous.**

**`sequencer_runs.org_id` -- same check:**

```sql
select
  count(*) filter (where org_id is null) as null_org_id,
  count(*) filter (where org_id is not null) as non_null_org_id,
  count(*) filter (where org_id is not null and exists (
    select 1 from organizations o where o.id = sequencer_runs.org_id
  )) as matches_organizations_id,
  count(*) filter (where org_id is not null and exists (
    select 1 from practice_groups pg where pg.id = sequencer_runs.org_id
  )) as matches_practice_groups_id
from sequencer_runs;
```

Result: `null_org_id: 20, non_null_org_id: 0`. All 20 rows have a null
`org_id` -- no live data either confirms or contradicts the org-id reading for
this column. The fix for `is_org_allowed_for_sequencing` is based on the
shared column name/write-path pattern with `weekly_assignments.org_id`, not
on live `sequencer_runs` data (there isn't any yet).

**Staff org/location nulls:**

```sql
select count(*) as total_staff,
  count(*) filter (where primary_location_id is null) as null_primary_location,
  count(*) filter (where organization_id is null) as null_org_id_col,
  count(*) filter (where organization_id is null and primary_location_id is null) as null_org_and_null_location
from staff;
```

Result: `total_staff: 113, null_primary_location: 8, null_org_id_col: 0,
null_org_and_null_location: 0`. All 8 staff with no primary location already
have `organization_id` set directly -- exactly the case the old
`get_user_org_id` handled wrong (INNER JOIN through a NULL location drops
the row entirely, ignoring the organization_id that was right there).

**Existing organization_id/location-chain mismatches:**

```sql
select
  (select count(*) from staff
     where organization_id is not null and primary_location_id is not null
       and organization_id <> (
         select pg.organization_id from locations l
         join practice_groups pg on pg.id = l.group_id
         where l.id = staff.primary_location_id
       )
  ) as mismatched_staff,
  (select count(*) from staff) as total_staff;
```

Result: `mismatched_staff: 0, total_staff: 113`. Confirms the ticket's "0
mismatches today, the structure is what's unsafe" framing.

**Existing triggers on `locations` / `practice_groups`:**

```sql
select t.tgname, c.relname, pg_get_triggerdef(t.oid) as def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and c.relname in ('locations','practice_groups');
```

Result: empty. No re-parent sync trigger existed before this migration.

**FK confirmation:**

```sql
select conname, conrelid::regclass as table_name, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid in ('public.locations'::regclass, 'public.practice_groups'::regclass, 'public.staff'::regclass)
  and contype = 'f';
```

Confirms `locations.group_id -> practice_groups.id` (two FK constraints,
`locations_org_fkey` and `locations_organization_id_fkey`, both defining the
same relationship -- a pre-existing duplicate, not something COR-2 asked to
touch), `practice_groups.organization_id -> organizations.id`, and
`staff.organization_id -> organizations.id`.

**`organizations` has no `active` column** (checked
`information_schema.columns`): `id, name, slug, practice_type, created_at,
created_by, app_display_name, email_sign_off, reply_to_email, logo_url,
brand_color, hr_email`. This is why `is_org_allowed_for_sequencing`'s fix
keeps the "active" check on `practice_groups` rather than moving it to
`organizations`.

**Caller-side confirmation of `filters.organizationId` (`FilterBar.tsx`):**
`loadOrganizations()` queries `.from('practice_groups').select('id, name')`;
`onFiltersChange({ ...filters, organizationId: value })` is set from that
list's `id`; `loadLocations()` then does
`.from('locations').eq('group_id', filters.organizationId)`. This is
`src/components/admin/eval-results/FilterBar.tsx`, the actual owner of
`filters.organizationId` for every consumer in `eval-results-v2`, including
`OrgSummaryStrip.tsx` -- confirming `filters.organizationId` is a
`practice_groups.id`, not an `organizations.id`, contrary to what its name
and the original ticket text suggest.

## Deliberately deferred (not done by this ticket)

- **Applying this migration.** Written and committed only, per the hard
  constraint for this work session. Application is a later, supervised step
  like SEC-1/SEC-2's.
- **Confirming the 8 NULL-`primary_location_id` staff actually see weekly
  assignments after apply.** Needs a real authenticated-session check against
  those 8 users post-apply; not something a read-only pre-apply pass can
  prove.
- **Any caller-side (`src/`) changes.** Not asked for, and `filters.organizationId`
  being a group id despite its name is exactly the kind of deprecated-naming
  cleanup CLAUDE.md's terminology table already tracks -- a rename there is
  its own ticket, not a DB migration.
- **`get_staff_domain_avgs` / `get_strengths_weaknesses`.** No verified bug
  found; left untouched (see above). If a future caller is wired up to
  either, it should be re-checked against this same group-id-vs-org-id
  question at that time, since "no caller today" is not the same as "correct
  forever."
- **The duplicate `locations_org_fkey` / `locations_organization_id_fkey`
  constraints** noticed while confirming FKs. Not part of COR-2's ask;
  logged here only so it isn't lost, per "note it, don't fix it."

## Appendix: verbatim live definitions

Fetched via `pg_get_functiondef(oid)` against project `yeypngaufuualdfzcjpk`,
2026-08-19/20, before writing the migration.

### `current_user_org_id()`

```sql
CREATE OR REPLACE FUNCTION public.current_user_org_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    s.organization_id,
    (SELECT pg.organization_id
       FROM public.locations l
       JOIN public.practice_groups pg ON pg.id = l.group_id
      WHERE l.id = s.primary_location_id
      LIMIT 1)
  )
  FROM public.staff s
  WHERE s.user_id = auth.uid()
  ORDER BY s.organization_id NULLS LAST
  LIMIT 1;
$function$
```

### `get_user_org_id(uuid)` (before this migration)

```sql
CREATE OR REPLACE FUNCTION public.get_user_org_id(p_user_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pg.organization_id
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  JOIN practice_groups pg ON pg.id = l.group_id
  WHERE s.user_id = p_user_id
  LIMIT 1;
$function$
```

### `org_id_of_staff(uuid)` / `org_id_of_location(uuid)` (unchanged, reference)

```sql
CREATE OR REPLACE FUNCTION public.org_id_of_staff(_staff_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    s.organization_id,
    (SELECT pg.organization_id
       FROM public.locations l
       JOIN public.practice_groups pg ON pg.id = l.group_id
      WHERE l.id = s.primary_location_id
      LIMIT 1)
  )
  FROM public.staff s
  WHERE s.id = _staff_id
  LIMIT 1;
$function$

CREATE OR REPLACE FUNCTION public.org_id_of_location(_location_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pg.organization_id
  FROM public.locations l
  JOIN public.practice_groups pg ON pg.id = l.group_id
  WHERE l.id = _location_id
  LIMIT 1;
$function$
```

### `is_org_allowed_for_sequencing(uuid)` (before this migration)

```sql
CREATE OR REPLACE FUNCTION public.is_org_allowed_for_sequencing(p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_org_id IS NULL THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.practice_groups o
      WHERE o.id = p_org_id
        AND o.active = true
    )
  END;
$function$
```

### `get_coach_roster_summary(uuid, date)` (before this migration)

```sql
CREATE OR REPLACE FUNCTION public.get_coach_roster_summary(p_coach_user_id uuid, p_week_start date DEFAULT NULL::date)
 RETURNS TABLE(staff_id uuid, staff_name text, role_id bigint, role_name text, location_id uuid, location_name text, group_id uuid, group_name text, active_monday date, required_count integer, conf_submitted_count integer, conf_late_count integer, perf_submitted_count integer, perf_late_count integer, backlog_count integer, last_conf_at timestamp with time zone, last_perf_at timestamp with time zone, tz text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_week_start date;
  v_coach_staff_id uuid;
  v_is_super_admin boolean;
BEGIN
  v_week_start := date_trunc('week', COALESCE(p_week_start, (NOW() AT TIME ZONE 'America/Chicago')::date))::date;

  SELECT s.id, s.is_super_admin
  INTO v_coach_staff_id, v_is_super_admin
  FROM staff s
  WHERE s.user_id = p_coach_user_id
    AND (s.is_coach OR s.is_lead OR s.is_super_admin OR s.is_org_admin OR s.is_office_manager)
  LIMIT 1;

  IF v_coach_staff_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH coach_scopes_expanded AS (
    SELECT cs.scope_type, cs.scope_id
    FROM coach_scopes cs
    WHERE cs.staff_id = v_coach_staff_id
  ),
  visible_staff AS (
    SELECT DISTINCT s.id AS staff_id
    FROM staff s
    INNER JOIN locations l ON l.id = s.primary_location_id
    WHERE s.is_participant
      AND s.primary_location_id IS NOT NULL
      AND (
        v_is_super_admin = true
        OR EXISTS (
          SELECT 1 FROM coach_scopes_expanded cse
          WHERE (cse.scope_type = 'org' AND l.group_id = cse.scope_id)
             OR (cse.scope_type = 'location' AND l.id = cse.scope_id)
        )
      )
  ),
  staff_assignments AS (
    SELECT
      vs.staff_id,
      wa.id AS assignment_id
    FROM visible_staff vs
    INNER JOIN staff st ON st.id = vs.staff_id
    LEFT JOIN weekly_assignments wa ON
      wa.role_id = st.role_id
      AND wa.week_start_date = v_week_start
      AND wa.status = 'locked'
      AND (wa.org_id IS NULL OR wa.org_id = (SELECT l2.group_id FROM locations l2 WHERE l2.id = st.primary_location_id))
      AND (wa.location_id IS NULL OR wa.location_id = st.primary_location_id)
  ),
  staff_scores AS (
    SELECT
      sa.staff_id,
      sa.assignment_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_late,
      ws.performance_score,
      ws.performance_date,
      ws.performance_late
    FROM staff_assignments sa
    LEFT JOIN weekly_scores ws ON
      ws.staff_id = sa.staff_id
      AND ws.assignment_id = ('assign:' || sa.assignment_id)
  ),
  staff_aggregates AS (
    SELECT
      ss.staff_id,
      COUNT(ss.assignment_id) AS required_count,
      COUNT(ss.confidence_score) AS conf_submitted_count,
      SUM(CASE WHEN ss.confidence_late = true THEN 1 ELSE 0 END) AS conf_late_count,
      COUNT(ss.performance_score) AS perf_submitted_count,
      SUM(CASE WHEN ss.performance_late = true THEN 1 ELSE 0 END) AS perf_late_count,
      MAX(ss.confidence_date) AS last_conf_at,
      MAX(ss.performance_date) AS last_perf_at
    FROM staff_scores ss
    WHERE ss.assignment_id IS NOT NULL
    GROUP BY ss.staff_id
  )
  SELECT
    s.id AS staff_id,
    s.name AS staff_name,
    s.role_id::bigint,
    r.role_name,
    s.primary_location_id AS location_id,
    l.name AS location_name,
    l.group_id,
    o.name AS group_name,
    v_week_start AS active_monday,
    COALESCE(sa.required_count, 0)::int AS required_count,
    COALESCE(sa.conf_submitted_count, 0)::int AS conf_submitted_count,
    COALESCE(sa.conf_late_count, 0)::int AS conf_late_count,
    COALESCE(sa.perf_submitted_count, 0)::int AS perf_submitted_count,
    COALESCE(sa.perf_late_count, 0)::int AS perf_late_count,
    0::int AS backlog_count,
    sa.last_conf_at,
    sa.last_perf_at,
    l.timezone AS tz
  FROM visible_staff vs
  INNER JOIN staff s ON s.id = vs.staff_id
  LEFT JOIN roles r ON r.role_id = s.role_id
  LEFT JOIN locations l ON l.id = s.primary_location_id
  LEFT JOIN practice_groups o ON o.id = l.group_id
  LEFT JOIN staff_aggregates sa ON sa.staff_id = s.id
  ORDER BY s.name;
END;
$function$
```

### `get_eval_distribution_metrics`, `get_location_domain_staff_averages` (live, before any SEC-2b guard -- reference, not modified by this migration)

```sql
CREATE OR REPLACE FUNCTION public.get_eval_distribution_metrics(p_org_id uuid, p_types text[], p_program_year integer, p_quarter text DEFAULT NULL::text, p_location_ids uuid[] DEFAULT NULL::uuid[], p_role_ids integer[] DEFAULT NULL::integer[])
 RETURNS TABLE(location_id uuid, location_name text, domain_id bigint, domain_name text, role_id integer, role_name text, staff_id uuid, staff_name text, evaluation_id uuid, evaluation_status text, n_items integer, obs_top_box integer, obs_bottom_box integer, self_top_box integer, self_bottom_box integer, mismatch_count integer, obs_mean numeric, self_mean numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    e.location_id::uuid,
    l.name::text AS location_name,
    ei.domain_id::bigint,
    ei.domain_name::text,
    r.role_id::int,
    r.role_name::text,
    e.staff_id::uuid,
    s.name::text AS staff_name,
    e.id::uuid AS evaluation_id,
    e.status::text AS evaluation_status,
    COUNT(*)::int AS n_items,
    COUNT(*) FILTER (WHERE ei.observer_score = 4)::int AS obs_top_box,
    COUNT(*) FILTER (WHERE ei.observer_score IN (1, 2))::int AS obs_bottom_box,
    COUNT(*) FILTER (WHERE ei.self_score = 4)::int AS self_top_box,
    COUNT(*) FILTER (WHERE ei.self_score IN (1, 2))::int AS self_bottom_box,
    COUNT(*) FILTER (WHERE ei.observer_score IS DISTINCT FROM ei.self_score)::int AS mismatch_count,
    ROUND(AVG(ei.observer_score), 1)::numeric(3,1) AS obs_mean,
    ROUND(AVG(ei.self_score), 1)::numeric(3,1) AS self_mean
  FROM evaluation_items ei
  JOIN evaluations e ON e.id = ei.evaluation_id
  JOIN staff s ON s.id = e.staff_id
  JOIN locations l ON l.id = e.location_id
  JOIN roles r ON r.role_id = s.role_id
  WHERE l.group_id = p_org_id
    AND e.type = ANY(p_types)
    AND e.program_year = p_program_year
    AND (p_quarter IS NULL OR e.quarter = p_quarter)
    AND (p_location_ids IS NULL OR e.location_id = ANY(p_location_ids))
    AND (p_role_ids IS NULL OR s.role_id = ANY(p_role_ids))
  GROUP BY
    e.location_id, l.name, ei.domain_id, ei.domain_name, r.role_id, r.role_name,
    e.staff_id, s.name, e.id, e.status;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.get_location_domain_staff_averages(p_org_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_include_no_eval boolean DEFAULT false, p_location_ids uuid[] DEFAULT NULL::uuid[], p_role_ids integer[] DEFAULT NULL::integer[], p_types text[] DEFAULT NULL::text[])
 RETURNS TABLE(location_id uuid, location_name text, staff_id uuid, staff_name text, role_id integer, role_name text, domain_id integer, domain_name text, n_items bigint, avg_observer numeric, avg_self numeric, eval_status text, has_eval boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH eval_items AS (
    SELECT
      e.id AS eval_id, e.staff_id, e.status AS eval_status, ei.domain_id, ei.observer_score, ei.self_score
    FROM evaluations e
    JOIN evaluation_items ei ON ei.evaluation_id = e.id
    WHERE e.created_at >= p_start
      AND e.created_at <= p_end
      AND (p_types IS NULL OR e.type = ANY(p_types))
  ),
  staff_domain_agg AS (
    SELECT
      s.id AS staff_id, s.name AS staff_name, s.role_id, r.role_name AS role_name,
      s.primary_location_id AS location_id, l.name AS location_name,
      d.domain_id AS domain_id, d.domain_name AS domain_name,
      COUNT(ei.observer_score) AS n_items,
      ROUND(AVG(ei.observer_score)::numeric, 2) AS avg_observer,
      ROUND(AVG(ei.self_score)::numeric, 2) AS avg_self,
      ei.eval_status,
      CASE WHEN COUNT(ei.observer_score) > 0 THEN true ELSE false END AS has_eval
    FROM staff s
    JOIN locations l ON l.id = s.primary_location_id
    JOIN roles r ON r.role_id = s.role_id
    CROSS JOIN domains d
    LEFT JOIN eval_items ei ON ei.staff_id = s.id AND ei.domain_id = d.domain_id
    WHERE l.group_id = p_org_id
      AND s.is_participant = true
      AND s.is_paused = false
      AND (p_location_ids IS NULL OR s.primary_location_id = ANY(p_location_ids))
      AND (p_role_ids IS NULL OR s.role_id = ANY(p_role_ids))
    GROUP BY s.id, s.name, s.role_id, r.role_name, s.primary_location_id, l.name, d.domain_id, d.domain_name, ei.eval_status
  )
  SELECT
    sda.location_id, sda.location_name, sda.staff_id, sda.staff_name, sda.role_id::integer, sda.role_name,
    sda.domain_id::integer, sda.domain_name, sda.n_items, sda.avg_observer, sda.avg_self, sda.eval_status, sda.has_eval
  FROM staff_domain_agg sda
  WHERE p_include_no_eval = true OR sda.has_eval = true
  ORDER BY sda.location_name, sda.staff_name, sda.domain_name;
END;
$function$
```

Both fetched live with **no guard clause present at all** in the body -- confirming SEC-2b's guard (original or fixed) has not been applied to the
database yet, only SEC-2a's grant revokes have (see the mixed-state table
above).

### `get_staff_domain_avgs` and `get_strengths_weaknesses` (unchanged, reference)

```sql
CREATE OR REPLACE FUNCTION public.get_staff_domain_avgs(p_org_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_location_ids uuid[] DEFAULT NULL::uuid[], p_role_ids integer[] DEFAULT NULL::integer[], p_eval_types text[] DEFAULT NULL::text[], p_include_no_eval boolean DEFAULT false)
 RETURNS TABLE(staff_id uuid, staff_name text, role_id integer, location_id uuid, location_name text, domain_id integer, domain_name text, observer_avg numeric, self_avg numeric, n_items integer, last_eval_at timestamp with time zone, has_eval boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH base_staff AS (
    SELECT
      s.id as staff_id,
      s.name as staff_name,
      s.role_id::int as role_id,
      s.primary_location_id as location_id
    FROM staff s
    JOIN locations l ON l.id = s.primary_location_id
    WHERE l.group_id = p_org_id
      AND s.is_org_admin = false
      AND (p_location_ids IS NULL OR array_length(p_location_ids, 1) IS NULL OR s.primary_location_id = ANY(p_location_ids))
      AND (p_role_ids IS NULL OR array_length(p_role_ids, 1) IS NULL OR s.role_id = ANY(p_role_ids))
  ),
  evals_in_range AS (
    SELECT e.id as evaluation_id, e.staff_id, e.updated_at as evaluated_at, e.type
    FROM evaluations e
    WHERE e.updated_at >= p_start AND e.updated_at < p_end
      AND (p_eval_types IS NULL OR array_length(p_eval_types, 1) IS NULL OR e.type = ANY(p_eval_types))
      AND e.status = 'submitted'
  ),
  items AS (
    SELECT
      e.staff_id,
      d.domain_id::int as domain_id,
      d.domain_name,
      i.observer_score,
      i.self_score,
      e.evaluated_at
    FROM evaluation_items i
    JOIN evals_in_range e ON e.evaluation_id = i.evaluation_id
    LEFT JOIN competencies c ON c.competency_id = i.competency_id
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    WHERE d.domain_id IS NOT NULL
  ),
  agg AS (
    SELECT
      i.staff_id,
      i.domain_id,
      i.domain_name,
      ROUND(AVG(i.observer_score)::numeric, 1) as observer_avg,
      ROUND(AVG(i.self_score)::numeric, 1) as self_avg,
      COUNT(*)::int as n_items,
      MAX(i.evaluated_at) as last_eval_at
    FROM items i
    GROUP BY i.staff_id, i.domain_id, i.domain_name
  )
  SELECT
    bs.staff_id,
    bs.staff_name,
    bs.role_id::int,
    bs.location_id,
    l.name as location_name,
    a.domain_id::int,
    a.domain_name,
    a.observer_avg,
    a.self_avg,
    a.n_items,
    a.last_eval_at,
    (a.staff_id IS NOT NULL) as has_eval
  FROM base_staff bs
  JOIN locations l ON l.id = bs.location_id
  LEFT JOIN agg a ON a.staff_id = bs.staff_id
  WHERE p_include_no_eval IS TRUE OR a.staff_id IS NOT NULL
  ORDER BY l.name, bs.staff_name, a.domain_name NULLS LAST;
END;
$function$
```

```sql
CREATE OR REPLACE FUNCTION public.get_strengths_weaknesses(p_org_id uuid, p_location_ids uuid[] DEFAULT NULL::uuid[], p_role_ids integer[] DEFAULT NULL::integer[], p_types text[] DEFAULT NULL::text[], p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(level text, id bigint, name text, n_items integer, avg_observer numeric, domain_id bigint, domain_name text, framework text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT *
    FROM view_evaluation_items_enriched v
    WHERE v.group_id = p_org_id
      AND (p_location_ids IS NULL OR v.primary_location_id = ANY(p_location_ids))
      AND (p_role_ids     IS NULL OR v.role_id            = ANY(p_role_ids))
      AND (p_types        IS NULL OR v.evaluation_type    = ANY(p_types))
      AND (p_start IS NULL OR v.evaluation_at >= p_start)
      AND (p_end   IS NULL OR v.evaluation_at <  p_end)
      AND v.observer_score IS NOT NULL
  ),
  domain_results AS (
    SELECT
      'domain'::text as level,
      b.domain_id as id,
      b.domain_name as name,
      COUNT(*)::int as n_items,
      ROUND(AVG(b.observer_score)::numeric, 2) as avg_observer,
      b.domain_id as domain_id,
      b.domain_name as domain_name,
      NULL::text as framework
    FROM base b
    WHERE b.domain_id IS NOT NULL
    GROUP BY b.domain_id, b.domain_name
  ),
  competency_results AS (
    SELECT
      'competency'::text as level,
      b.competency_id as id,
      c.name as name,
      COUNT(*)::int as n_items,
      ROUND(AVG(b.observer_score)::numeric, 2) as avg_observer,
      b.domain_id as domain_id,
      b.domain_name as domain_name,
      CASE
        WHEN c.code LIKE 'DFI.%' THEN 'DFI'
        WHEN c.code LIKE 'RDA.%' THEN 'RDA'
        ELSE NULL
      END as framework
    FROM base b
    LEFT JOIN competencies c ON c.competency_id = b.competency_id
    WHERE b.competency_id IS NOT NULL
    GROUP BY b.competency_id, c.name, b.domain_id, b.domain_name, c.code
  )
  SELECT dr.level, dr.id, dr.name, dr.n_items, dr.avg_observer, dr.domain_id, dr.domain_name, dr.framework FROM domain_results dr
  UNION ALL
  SELECT cr.level, cr.id, cr.name, cr.n_items, cr.avg_observer, cr.domain_id, cr.domain_name, cr.framework FROM competency_results cr
  ORDER BY domain_id, level, avg_observer DESC;
END;
$function$
```

### `view_evaluation_items_enriched` (reference -- confirms no `organization_id` column)

```sql
SELECT e.id AS evaluation_id,
    e.type AS evaluation_type,
    e.quarter,
    e.program_year,
    e.created_at AS evaluation_at,
    subj.id AS staff_id,
    subj.name AS staff_name,
    subj.role_id,
    subj.primary_location_id,
    COALESCE(loc.name, 'Unknown Location'::text) AS location_name,
    loc.group_id,
    ei.competency_id,
    c.domain_id,
    COALESCE(d.domain_name, 'Unassigned'::text) AS domain_name,
    ei.observer_score,
    ei.self_score
   FROM (((((evaluation_items ei
     JOIN evaluations e ON ((e.id = ei.evaluation_id)))
     JOIN staff subj ON ((subj.id = e.staff_id)))
     LEFT JOIN locations loc ON ((loc.id = subj.primary_location_id)))
     LEFT JOIN competencies c ON ((c.competency_id = ei.competency_id)))
     LEFT JOIN domains d ON ((d.domain_id = c.domain_id)));
```

### `staff_fill_organization_id()` / `update_staff_location_organization()` (reference, unchanged)

```sql
CREATE OR REPLACE FUNCTION public.staff_fill_organization_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.primary_location_id IS NOT NULL THEN
    SELECT pg.organization_id
      INTO NEW.organization_id
    FROM public.locations l
    JOIN public.practice_groups pg ON pg.id = l.group_id
    WHERE l.id = NEW.primary_location_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.update_staff_location_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.primary_location_id IS NOT NULL THEN
    SELECT l.name, o.name
    INTO NEW.location, NEW.organization
    FROM locations l
    JOIN practice_groups o ON o.id = l.group_id
    WHERE l.id = NEW.primary_location_id;
  ELSE
    NEW.location := NULL;
    NEW.organization := NULL;
  END IF;

  RETURN NEW;
END;
$function$
```

Note: `update_staff_location_organization()` denormalizes `staff.location`
and `staff.organization` (plain text label columns, not the `organization_id`
uuid this ticket is about) -- this is the "`staff` has undocumented
denormalized org columns with no sync guarantee" line item from the same
assessment pass. Out of scope here; noted, not fixed.

### `seq_latest_quarterly_evals` overloads (reference, unchanged)

```sql
CREATE OR REPLACE FUNCTION public.seq_latest_quarterly_evals(p_org_id uuid, p_role_id bigint)
 RETURNS TABLE(competency_id bigint, score01 numeric, effective_date text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    ei.competency_id,
    AVG(ei.observer_score / 10.0) AS score01,
    TO_CHAR(MAX(e.updated_at)::date, 'YYYY-MM-DD') AS effective_date
  FROM evaluation_items ei
  JOIN evaluations e ON e.id = ei.evaluation_id
  JOIN staff s ON s.id = e.staff_id
  JOIN locations l ON l.id = s.primary_location_id
  WHERE l.group_id = p_org_id
    AND e.type = 'Quarterly'
    AND e.status = 'submitted'
    AND ei.observer_score IS NOT NULL
  GROUP BY ei.competency_id;
END;
$function$

CREATE OR REPLACE FUNCTION public.seq_latest_quarterly_evals(role_id_arg integer)
 RETURNS TABLE(competency_id integer, score double precision)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH latest_eval_per_staff AS (
    SELECT DISTINCT ON (e.staff_id)
           e.id AS evaluation_id
    FROM evaluations e
    WHERE e.type = 'Quarterly'
      AND e.status = 'submitted'
    ORDER BY e.staff_id, e.updated_at DESC
  )
  SELECT ei.competency_id::INT,
         AVG((ei.observer_score)::DOUBLE PRECISION / 10.0) AS score
  FROM evaluation_items ei
  JOIN latest_eval_per_staff le ON le.evaluation_id = ei.evaluation_id
  JOIN competencies c ON c.competency_id = ei.competency_id
  WHERE c.role_id = role_id_arg
    AND ei.observer_score IS NOT NULL
  GROUP BY ei.competency_id
$function$
```
