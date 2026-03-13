

# Enterprise Readiness Audit

## Section-by-Section Findings

---

### 🔴 Super Admin

| Requirement | Status | Notes |
|---|---|---|
| See/manage all orgs, groups, locations, staff | **PASS** | RLS has super_admin overrides on all key tables |
| Bootstrap new org via Platform Console | **PASS** | `OrgBootstrapDrawer` exists, practice type selector works |
| Create/clone/edit roles & competencies | **PASS** | `PlatformRolesTab` + `CloneRoleDialog` exist |
| Impersonate any user | **PASS** | `ImpersonationTab` exists in Platform Console |
| See ALL groups in eval filter dropdown | **PASS** | `FilterBar` loads all `practice_groups` when `isSuperAdmin` (no org filter) |
| Release evals for any org | **PASS** | `release_single_evaluation` RPC allows any coach/admin; super admin RLS on evaluations is ALL |

No blockers for Super Admin.

---

### 🟡 Org Admin

| Requirement | Status | Notes |
|---|---|---|
| See only own org's locations/groups | **PASS** | `AdminLocationsTab` and `AdminOrganizationsTab` filter by `organizationId` from `useUserRole()` |
| See only own org groups in eval filter | **PASS** | `FilterBar` scopes by `callerOrgId` for non-super-admins |
| Manage groups/locations within own org | **PASS** | RLS on `practice_groups` and `locations` enforces `organization_id = get_user_org_id(auth.uid())` |
| Invite users only into own org | **PASS** | `admin-users` edge function has org ownership check on `invite_user` (lines 242-271) |
| Hide pro moves for own org | **PASS** | `OrgProMoveLibraryTab` uses `organization_pro_move_overrides` |
| Manage weekly assignments scoped to org | **PASS** | RLS on `weekly_assignments`: `org_id = get_user_org_id(auth.uid())` |
| Setup wizard banner on first login | **PASS** | `AdminPage` shows banner when no `organization_role_names` exist |

| Requirement | Status | Issue |
|---|---|---|
| **Users tab shows only own org users** | **FAIL** | PostgREST embedded filter bug — `q.in("locations.group_id", orgGroupIds)` on line 128 filters nested data but does NOT exclude parent staff rows. All staff from all orgs are returned. |

**Fix needed**: `admin-users` edge function lines 113 and 128 — replace embedded `locations.group_id` filter with a two-step lookup resolving location IDs first, then filtering `staff.primary_location_id` directly.

---

### 🟢 Coach

| Requirement | Status | Issue |
|---|---|---|
| View/manage evals only for own org staff | **FAIL — RLS gap** | The `evaluations` RLS policy for coaches uses `is_coach_or_admin(auth.uid())`. This function checks `is_coach = true OR is_super_admin = true` — it does NOT scope by organization. **Any coach at any org can read/write ALL evaluations across all orgs.** |
| Release evals only for own org | **FAIL — RLS gap** | Same issue. `release_single_evaluation` and `bulk_release_evaluations` RPCs check `is_coach OR is_super_admin OR is_org_admin` but do NOT verify the eval belongs to the caller's org. A coach at Org A could release evals at Org B by passing the eval ID. |
| Sequencer filters by practice type | **FAIL** | `sequencer-rank` fetches pro moves with `.eq('role_id', body.roleId)` but does NOT filter by `practice_types`. It also hardcodes `roleId: 1 | 2` in the type. A general_uk org's coach calling the sequencer would get pediatric_us moves if they share the same `role_id`. |

These are the most critical findings in the audit. Three fixes needed:

1. **Evaluations RLS**: The `is_coach_or_admin` function must be org-scoped, OR the evaluations RLS policies need to add org-boundary checks (e.g., verify the eval's `location_id` belongs to the caller's org via `get_user_org_id`).

2. **Release RPCs**: `release_single_evaluation` and `bulk_release_evaluations` need org ownership validation — verify the target eval's location belongs to the caller's org (unless super admin).

3. **Sequencer practice_type filter**: Add a `practice_types` filter (using `.contains()` or `.overlaps()`) to the pro_moves query in `sequencer-rank`, accepting a `practiceType` parameter from the caller.

---

### 🔵 Staff

| Requirement | Status | Notes |
|---|---|---|
| See only own org weekly assignments | **PASS** | RLS on `weekly_assignments` enforces `org_id = get_user_org_id(auth.uid())` |
| View released eval with correct URL | **PARTIAL** | `notify-eval-release` uses env-var `APP_URL` (good), but 3 other edge functions still hardcode `alcanskills.lovable.app` |

**Hardcoded URLs that need fixing**:
- `supabase/functions/invite-to-schedule/index.ts` line 129: hardcoded `https://alcanskills.lovable.app/doctor/review-prep/...`
- `supabase/functions/notify-meeting-summary/index.ts` line 95: hardcoded `https://alcanskills.lovable.app/doctor/review-prep/...`
- `src/components/clinical/SchedulingInviteComposer.tsx` lines 143, 176: hardcoded `https://alcanskills.lovable.app/doctor/review-prep/...`
- `supabase/functions/admin-users/index.ts` line 10: `SITE_URL` defaults to `https://alcanskills.lovable.app`

All edge functions should use `Deno.env.get('APP_URL')` with a platform-neutral default.

---

### ⚙️ System / Cross-cutting

| Requirement | Status | Issue |
|---|---|---|
| Practice type filtering for pro moves/roles | **PARTIAL** | Pro moves filter by `practice_types` in the UI but the sequencer ignores it |
| RLS on evaluations enforces org boundaries | **FAIL** | `is_coach_or_admin` grants ALL access to any coach globally — no org scoping |
| RLS on evaluation_items enforces org boundaries | **FAIL** | Same — delegates to evaluations which has no org check |
| RLS on weekly_assignments | **PASS** | Uses `org_id = get_user_org_id()` |
| RLS on practice_groups | **PASS** | Org-scoped for admins |
| RLS on locations | **PASS** | Org-scoped for admins |
| `weekly_scores` RLS | **FAIL** | "Coaches can read all scores" policy checks `is_coach = true OR is_super_admin = true` — no org boundary. Any coach can read scores for staff at other orgs. |

---

## Priority Summary

### P0 — Security / Data Isolation (blocks enterprise deployment)

1. **Evaluations RLS cross-org leak**: Any coach can read/write/release evaluations for any org. Fix `is_coach_or_admin` or add org-scoped policies.
2. **weekly_scores RLS cross-org leak**: Any coach can read scores for staff at any org. Add org boundary check.
3. **Release RPCs missing org validation**: `release_single_evaluation` and `bulk_release_evaluations` don't verify org ownership.

### P1 — Functional Bugs (broken behavior)

4. **admin-users PostgREST filter bug**: Lines 113, 128 — embedded `locations.group_id` filter doesn't exclude parent rows. Users tab shows cross-org staff.
5. **sequencer-rank missing practice_type filter**: Returns all pro moves for a role regardless of practice type.

### P2 — Hardcoded URLs (blocks multi-org emails)

6. **3 edge functions + 1 component** hardcode `alcanskills.lovable.app` — must use `APP_URL` env var.

