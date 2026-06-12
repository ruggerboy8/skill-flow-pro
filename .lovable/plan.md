
# Multi-tenant isolation: verified findings & remediation plan

I checked the audit claims against live RLS policies, edge function source, and DB columns. Below is what's actually true today, what's wrong in the audit, and the order to fix it. The pro-move picker redesign is intentionally **parked** — we lock down the bleed-throughs first, then redesign the picker (with custom moves as a first-class requirement).

## What I verified

### Confirmed — critical
- **`backfill-format-evaluator-notes`**: no JWT check, uses service role, accepts arbitrary `ids[]`. An unauthenticated caller can read & overwrite any org's evaluator notes.
- **`excused_locations` RLS**: SELECT policy is literally `auth.uid() IS NOT NULL` (everyone reads everything). The admin-write policy checks role flag only, no org scope.
- **`excused_submissions` RLS**: same write hole — `is_org_admin OR is_super_admin` with no org scoping.
- **`coaching_sessions` / `coaching_meeting_records`**: "Clinical staff can view all" policies check `is_clinical_director OR is_super_admin` with no org scope — a clinical director in one org sees every org's sessions.
- **`practice_groups` SELECT**: a permissive `read orgs (auth) qual: true` exists → any logged-in user lists every org.
- **`locations` SELECT**: a permissive `read locations (auth) qual: true` exists → same problem.
- **`staff` SELECT (`Coaches can read all staff`)**: `is_coach_or_admin(auth.uid())` with no org filter — any coach or admin in any org reads every staff row platform-wide. This is the root cause of the masquerade/sim bleed-through.
- **`admin-users.list_users`**: only gates on `is_super_admin OR is_org_admin`. The `organization_id` filter is taken straight from the request body with no check that the caller belongs to that org.
- **`pro-move-suggest`**: service role + caller-supplied `orgId` + no auth. Lets anyone enumerate per-org pro-move visibility overrides.
- **`deputy-oauth-callback`**: `org_id` is decoded from the OAuth `state` param and used to upsert credentials with no verification that the original caller belongs to that org. A user could initiate the Deputy flow with a forged state and bind their Deputy install to another org's row.
- **SimConsole / `useStaffProfile` masquerade**: `SimConsole.tsx` loads `staff` with no `organization_id` filter; `useStaffProfile` switches the query to `eq('id', masqueradeStaffId)` without verifying the target staff's org matches the real caller's org. Combined with the permissive `staff` SELECT above, super-admin-only intent isn't enforced.

### Schema ambiguity — confirmed and worse than the audit said
- `weekly_assignments.org_id` actually stores `organizations.id` (verified by joining live rows).
- `locationState.ts:264` sets `orgId = staff.locations.group_id` (a **practice group** id) and then filters `weekly_assignments.org_id` with it. For any multi-tenant org this returns zero assignments. Every other call site I checked (`useWeeklyAssignments`, `planner-upsert`, `sequencer-auto-assign`, `TeamWeeklyFocus`, `AdminBuilder`, `OrgSetupWizard`, etc.) correctly passes the organization id. `locationState.ts` is the odd one out.

### Audit was inaccurate on
- The audit framed `pro-move-suggest` as exposing curriculum customizations broadly. It only reads `organization_pro_move_overrides.is_hidden` flags + the global `pro_moves` table — real but lower-impact than "enumerate another org's curriculum".
- Nothing else in the audit was overstated in a way that changes priority.

## Remediation order

Each step is a small, reviewable change. Steps 1–4 close the active bleed-throughs; 5–7 harden the rest; 8 is the picker redesign.

### 1. Stop the unauthenticated edge functions (today)
- `backfill-format-evaluator-notes`: require JWT, look up caller's staff row, verify `is_super_admin` (this is a one-off backfill tool). Reject otherwise.
- `pro-move-suggest`: require JWT; resolve caller's org via `current_user_org_id()` and ignore the request-body `orgId`, or reject if they don't match.
- `deputy-oauth-callback`: keep it public (OAuth callback), but verify the `state.org_id` matches the org of the `state.staff_id` (looked up server-side) before writing, and treat mismatches as an error redirect.

### 2. Lock down `admin-users`
- In `list_users` (and any other branch using `organization_id` from payload), resolve the caller's org via `current_user_org_id()`. If the caller is not super admin, force `organization_id = caller_org_id`. If they pass a different one, 403.
- Audit the other actions in that file for the same pattern.

### 3. Fix the four leaky RLS policies
One migration that:
- Drops `read locations (auth)` and `read orgs (auth)` permissive `qual: true` SELECT policies. Replace with org-scoped reads (`organization_id = get_user_org_id(auth.uid())` or super admin).
- Replaces `Coaches can read all staff` with a scoped variant: same access, but only for staff in the caller's org (or super admin). Doctor/office-manager/own-row policies stay as-is.
- Rewrites `excused_locations` and `excused_submissions` policies to scope both read and write to the caller's org. Self-read for staff stays.
- Rewrites the "Clinical staff can view all sessions/records" policies to scope by the doctor's/coach's org.

This is the highest-blast-radius change — I'll keep super-admin escape hatches and run the existing test paths after.

### 4. Harden masquerade
- `SimConsole` staff query: filter to caller's org unless caller is super admin.
- `useStaffProfile` (and `useStaffWeeklyScores`): when `masqueradeStaffId` is set and caller is not super admin, verify the target staff's `organization_id` matches the caller's before issuing queries; otherwise clear the override.

### 5. Fix the `weekly_assignments.org_id` mismatch in `locationState.ts`
- Resolve true `organization_id` via the location's `practice_groups.organization_id` (or use the staff record's `organization_id` column directly, which already exists). Replace the `group_id` value passed into `assembleWeek`.
- Verify against a multi-tenant org that assignments now load.

### 6. Add regression guards
- A SQL test (run via `supabase--read_query` in CI/manual) that asserts: a non-super-admin authenticated user can't see staff/locations/practice_groups/excused_*/coaching_* rows outside their org. Easy to keep around as a sanity script.

### 7. Update security memory & audit doc
- Write `docs/multi-tenant-isolation-audit.md` capturing the verified findings, what was fixed, and the residual risks (e.g. `deputy-oauth-callback` is still trust-on-state by design).
- Update security memory with the new posture.

### 8. (Separate track) Pro-move picker redesign
Hold this until 1–4 ship. Requirements for the redesign:
- Custom org-authored pro moves are first-class and pickable everywhere standard moves are (Browse tab in `SmartSlotPicker`, builder, recommender).
- This needs the data-model work we already scoped: `weekly_assignments.org_move_id`, `planner-upsert` accepting either `actionId` or `orgMoveId`, and the coach RPCs (`get_staff_weekly_scores`, `get_staff_all_weekly_scores`) coalescing from `organization_pro_moves`.
- Before any code, I'll come back with 2–3 rendered design directions for the picker UX itself (filters, search, custom-move affordance, density). No changes until you pick one.

## Technical details

- `current_user_org_id()` already exists and resolves via `staff → locations → practice_groups`. Most fixes can lean on it.
- `staff.organization_id` is populated (used by `admin-users` invite path) — safe to use directly in policies once we confirm coverage, which avoids the join.
- The RLS migration in step 3 must run after `20260306190002` (the migration that added `practice_groups.organization_id`); all current migrations are already later, so no ordering risk.
- Edge function auth pattern to standardize on: `getClaims(authHeader)` → look up caller's staff → verify org or role before any service-role write.

## Out of scope for this plan
- Pro-move picker UX redesign itself (parked until step 8, separate plan).
- Any UI changes beyond what's needed for the masquerade fix in step 4.
