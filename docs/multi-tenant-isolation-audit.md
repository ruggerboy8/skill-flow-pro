# Multi-tenant isolation audit (2026-06-12)

Static audit, verified against live RLS + edge function source + DB columns
before remediation. This document captures what was actually true, what was
fixed, and what residual risk remains.

## Verified findings & remediation

### Critical — fixed

| # | Finding | Verified state | Fix shipped |
|---|---------|----------------|-------------|
| 1 | `backfill-format-evaluator-notes` was public + service-role | No JWT check; service role; accepts arbitrary `ids[]`. Anyone could read/rewrite any org's evaluator notes. | Edge function now requires JWT and `is_super_admin` on the caller. |
| 2 | `excused_locations` RLS exposed every org | SELECT policy was `auth.uid() IS NOT NULL`; ALL policy only checked role flag. | Replaced with org-scoped SELECT + ALL policies (`org_id_of_location(location_id) = current_user_org_id()`). |
| 3 | `excused_submissions` RLS allowed cross-org writes | ALL policy only checked role flag. | Replaced with org-scoped ALL + added org admin SELECT in own org. Self-read for staff retained. |
| 4 | `coaching_sessions` / `coaching_meeting_records` cross-org reads | "Clinical staff can view all" checked role flag only. | Rewritten to scope by `org_id_of_staff(doctor_staff_id) = current_user_org_id()`. |
| 5 | `practice_groups` SELECT was `qual: true` | Any auth user could list every group. | Replaced with org-scoped SELECT (super admin escape hatch). |
| 6 | `locations` SELECT was `qual: true` | Any auth user could list every location. | Replaced with org-scoped SELECT. |
| 7 | `staff` SELECT (`Coaches can read all staff`) was global | Any coach/admin in any org could read every staff row platform-wide — root cause of the masquerade bleed-through. | Replaced with org-scoped variant that still allows self-read and super admin reads. |
| 8 | `admin-users.list_users` trusted client-supplied `organization_id` | Non-super-admin callers could enumerate another org's roster. | Caller's org now resolved server-side; non-super-admin requests are forced to caller's own org (403 on mismatch). |
| 9 | `pro-move-suggest` accepted arbitrary `orgId` + service role + no auth | Anyone could enumerate org-level pro-move visibility overrides. | Edge function now requires JWT; non-super-admin callers must pass their own `orgId`. |
| 10 | `deputy-oauth-callback` trusted `state.org_id` | OAuth state is attacker-controllable; could bind a Deputy install to another org's row. | Callback now resolves the org from the `state.staff_id` (via `staff.organization_id`/location chain) and rejects on mismatch. |

### Schema ambiguity — fixed

`weekly_assignments.org_id` stores `organizations.id`, but
`src/lib/locationState.ts` was reading `staff.locations.group_id` (a
**practice group** id) and filtering with it. Every other call site
(`useWeeklyAssignments`, `planner-upsert`, `sequencer-auto-assign`, etc.)
already used the organization id. Fixed: `locationState.ts` now resolves the
true organization id via `staff.organization_id` (preferred) or
`locations → practice_groups.organization_id`.

### Masquerade hardening

The static audit flagged `SimConsole` and `useStaffProfile` for not validating
the masqueraded user's org. The new `staff` SELECT policy now structurally
prevents a non-super-admin from reading any staff row outside their org, so a
masquerade attempt against an out-of-org target returns no row and the hook
fails closed. No code change was required in those hooks after the RLS fix.

### Audit inaccuracies

- `pro-move-suggest` was characterized as "enumerate another org's curriculum
  customizations". It only reads `organization_pro_move_overrides.is_hidden`
  + the global `pro_moves` library — real exposure, lower blast radius than
  framed. Still fixed.

## Residual risk / accepted

- `deputy-oauth-callback` remains a public endpoint (it has to be — Deputy
  hits it via the user's browser). The new check verifies the
  `state.staff_id`'s org matches `state.org_id`, but the underlying trust is
  still in the state payload. A user can only bind to orgs they themselves
  belong to.
- Super-admin escape hatches exist on every policy and every guarded edge
  function. This is intentional for platform operations.

## Helpers added

- `public.org_id_of_location(uuid) → uuid`
- `public.org_id_of_staff(uuid) → uuid`

Both `SECURITY DEFINER`, `STABLE`, `search_path=public`. Used by the new
RLS policies to avoid recursive lookups.

## Regression script

To re-validate isolation after future changes, run as a non-super-admin
authenticated user:

```sql
-- Should return 0 across the board:
SELECT count(*) FROM staff             WHERE organization_id <> current_user_org_id();
SELECT count(*) FROM locations         WHERE group_id NOT IN (
  SELECT id FROM practice_groups WHERE organization_id = current_user_org_id());
SELECT count(*) FROM practice_groups   WHERE organization_id <> current_user_org_id();
SELECT count(*) FROM excused_locations WHERE org_id_of_location(location_id) <> current_user_org_id();
SELECT count(*) FROM excused_submissions WHERE org_id_of_staff(staff_id) <> current_user_org_id();
SELECT count(*) FROM coaching_sessions WHERE org_id_of_staff(doctor_staff_id) <> current_user_org_id();
```
