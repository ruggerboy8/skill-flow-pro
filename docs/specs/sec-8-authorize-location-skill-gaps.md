# Spec: SEC-8, authorize get_location_skill_gaps

**Status:** built 2026-08-26, awaiting supervised apply + live test.
**Lane:** medium (single idempotent DB migration; one SECURITY DEFINER function).
**Ticket:** SEC-8 (Motion, MyProMoves Dev Board).
**Branch:** fix/sec-8-authorize-location-skill-gaps
**Priority:** HIGH (live cross-org data leak).

## What and why

`get_location_skill_gaps(p_location_id, p_lookback_weeks, p_limit_per_role)` is
`SECURITY DEFINER` and EXECUTE-granted to `authenticated`, but performs **no
authorization** on its `p_location_id` argument. Any logged-in user, using the
public anon key, can pass any location's id (including another tenant's) and
read that location's skill-gap data: the weakest pro moves per role, average
confidence scores, and staff counts. Confirmed live 2026-08-26 (definer, granted
to authenticated, no guard in the body).

## The fix

Add the same caller-authorization guard already used by the sibling function
`get_location_domain_staff_averages` (installed by the SEC-2b family), so the
location-scoped function surface shares one idiom.

Resolve the location's org via `locations.group_id ->
practice_groups.organization_id` and require it to equal
`current_user_org_id()`, unless the caller is a super admin:

```sql
IF ( SELECT pg.organization_id
     FROM public.locations l
     JOIN public.practice_groups pg ON pg.id = l.group_id
     WHERE l.id = p_location_id )
   IS DISTINCT FROM public.current_user_org_id()
   AND NOT EXISTS ( SELECT 1 FROM public.staff s
                    WHERE s.user_id = auth.uid() AND s.is_super_admin = true )
THEN
  RAISE EXCEPTION 'forbidden';
END IF;
```

The function was `LANGUAGE sql`; it is converted to `plpgsql` to carry the
guard, and the query body is otherwise unchanged from the live definition. A
nonexistent location resolves to a NULL org and is also rejected (does not leak
existence). Migration:
`supabase/migrations/20260826180000_sec8_authorize_get_location_skill_gaps.sql`,
idempotent (`CREATE OR REPLACE`), ending in a `DO $$` self-check that fails if
the function is not plpgsql, lost `SECURITY DEFINER`, or lacks the guard text.

### Why this does not need to lag a Lovable deploy

Both callers already pass the viewer's own location ids, which resolve to the
caller's own org and pass the guard:
- `src/components/dashboard/LocationSkillGaps.tsx` (single `locationId` prop)
- `src/components/dashboard/DomainConfidenceHeatmap.tsx` (maps over
  `locationIds`, the viewer's own locations)

So adding the guard breaks no legitimate call. It can be applied directly.

## Acceptance script

### Part A, SQL verification (right after apply; the migration self-check asserts most of this)

1. `get_location_skill_gaps` is now `plpgsql`, still `SECURITY DEFINER`, and its
   body contains the `RAISE EXCEPTION 'forbidden'` guard (`pg_get_functiondef`).
2. Cross-org call is rejected: as a non-super-admin in org A, calling the
   function with a location id belonging to org B raises `forbidden`. (Verified
   by reasoning about the guard, or with a scoped `SET LOCAL ROLE` + JWT-claim
   test in a rolled-back transaction; not a persistent write.)
3. Same-org call still returns rows: calling with a location in the caller's own
   org returns the expected skill-gap rows.

### Part B, real signed-in user (John, in the live app)

4. Open the dashboard/surface that shows the Location Skill Gaps card and the
   Domain Confidence heatmap for your own location(s). Confirm they still load
   and show data (this is the same-org path, which must keep working).
5. As a super admin, confirm the same surfaces still load across locations
   (super-admin exemption path).

## Personas to test as

- Org admin / coach viewing their own location(s): data still loads.
- Super admin: data loads across locations (exempt from the org match).
- (Attacker) any authenticated user probing a foreign location id: rejected.

## Out of scope

- The broader over-grant surface (SEC-9) and the other unauthorized-definer
  functions (SEC-4 already handled two; SEC-5 handles the clinical/baseline
  track). This ticket fixes only `get_location_skill_gaps`.

## DB impact

One idempotent `CREATE OR REPLACE FUNCTION` plus a self-check block. No data
change, no grant change (EXECUTE to authenticated stays; the guard is in-body).
Applied via the Supabase SQL Editor / MCP, supervised, then Part B tested live.

## Docs the builder must read

- `docs/specs/sec-2-lock-anon-callable-functions.md` (the guard idiom's origin)
- the live `get_location_domain_staff_averages` definition (the pattern mirrored)
- CLAUDE.md "Applying migrations" and the RLS dependency rule
