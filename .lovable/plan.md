## Practice Type on Roles + Multi-Select Practice Type on Pro Moves

**Status: ✅ Complete**

### What changed

1. **Practice types expanded** to three region-specific values: `pediatric_us`, `general_us`, `general_uk`
2. **`roles.practice_type`** column added — each role belongs to one practice type
3. **`pro_moves.practice_type`** converted to **`pro_moves.practice_types TEXT[]`** — array-based multi-select
4. All existing data backfilled (`pediatric` → `pediatric_us`, `general` → `general_us`, `all` → all three)

### Files changed

| File | Change |
|------|--------|
| Migration SQL | Schema: expanded CHECK on orgs, added practice_types array on pro_moves, added practice_type on roles |
| `RoleFormDrawer.tsx` | Added practice type Select (3 options) |
| `PlatformRolesTab.tsx` | Shows practice type badge on role cards, fetches practice_type |
| `ProMoveForm.tsx` | Replaced single Select with multi-checkbox for practice_types |
| `DoctorProMoveForm.tsx` | Defaults practice_types to `['pediatric_us']` |
| `OrgBootstrapDrawer.tsx` | 3 radio options with new labels |
| `PlatformOrgsTab.tsx` | Badge display for all 3 practice types |
| `OrgProMoveLibraryTab.tsx` | Uses `.overlaps('practice_types', [orgPracticeType])` |
| `ProMoveList.tsx` | Uses `.overlaps('practice_types', [filter])` |
| `ProMoveLibrary.tsx` | Updated filter chips to 4 options (All + 3 types) |

## Enterprise Isolation Fix

**Status: ✅ Complete**

### What changed

1. **`get_user_org_id()` SECURITY DEFINER function** — resolves a user's `organization_id` via `staff → locations → practice_groups`, used in all org-scoped RLS policies
2. **Alcan backfill** — 96 legacy `source='global', org_id=NULL` assignments updated to `source='org', org_id=<alcan_id>`
3. **`weekly_assignments` RLS** — dropped permissive global-read policy (bleedover source), added org-scoped SELECT and org-admin ALL policies
4. **`practice_groups` RLS** — added org-admin write policy (INSERT/UPDATE/DELETE within own org)
5. **`locations` RLS** — added org-admin write policy (within own org's groups)
6. **CHECK constraints** — `weekly_assignments_source_check` updated to allow `'org'`; combo check updated for `source='org'` requiring `org_id IS NOT NULL`
7. **`assembleWeek()`** — resolves `organization_id` from location's practice_group, queries by `org_id` with no fallback
8. **`GlobalAssignmentBuilder`** — saves with `org_id` from `useUserRole()` and `source: 'org'`

### Files changed

| File | Change |
|------|--------|
| Migration SQL | `get_user_org_id()`, CHECK constraints, RLS policies, backfill |
| `src/lib/locationState.ts` | `assembleWeek()` queries by `org_id`, no fallback |
| `src/components/admin/GlobalAssignmentBuilder.tsx` | Uses `useUserRole().organizationId`, saves with `source: 'org'` |
