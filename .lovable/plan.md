

# Fix "My Team" Tab for Roaming Doctors

## Problem
Two issues combine to show zero pro moves in the doctor "My Team → This Week" tab:

1. **Org-scoped assignments**: All `weekly_assignments` now have `org_id` set (e.g., `a1ca0000-...`). The `TeamWeeklyFocus` component queries for `org_id IS NULL`, which matches nothing.

2. **Roaming doctors have no org**: Roaming doctors have `primary_location_id = null`, so the org resolution chain (`staff → locations → practice_groups → organization_id`) returns `undefined`. Even if we fix the query to use `org_id`, there's no org to filter by.

## Solution

Update `TeamWeeklyFocus` to resolve the doctor's organization and query org-scoped assignments.

### File: `src/components/doctor/TeamWeeklyFocus.tsx`

**Step 1 — Resolve the doctor's org ID**

Use `useUserRole()` (or `useStaffProfile()`) to get `organizationId`. For roaming doctors where this is `undefined`, add a fallback: query `practice_groups` to find orgs the doctor is associated with (via a simple RPC or direct query). Since all current doctors belong to one org, a practical approach is:

- If `organizationId` exists from `useUserRole()` → use it
- If not (roaming), query `organizations` table to get the single org (or use a new lightweight query joining through `coach_scopes` or the doctor's `practice_groups` association)

Given the current data model doesn't store org on the staff record for roaming doctors, the cleanest fix is:

**Option A (recommended)**: Add a `organization_id` column to the `staff` table for direct org membership, populated during doctor invite. This is the proper long-term fix.

**Option B (quick fix)**: Since there's currently only one active org, query the first organization and use its ID. This works now but won't scale.

**I recommend Option A** — a migration + backfill + code update.

### Migration: Add `organization_id` to `staff`

```sql
ALTER TABLE public.staff ADD COLUMN organization_id uuid REFERENCES organizations(id);

-- Backfill from location chain for non-roaming staff
UPDATE staff s
SET organization_id = pg.organization_id
FROM locations l
JOIN practice_groups pg ON pg.id = l.group_id
WHERE l.id = s.primary_location_id
  AND s.organization_id IS NULL;

-- Backfill roaming doctors to the single known org
UPDATE staff
SET organization_id = 'a1ca0000-0000-0000-0000-000000000001'
WHERE is_doctor = true
  AND primary_location_id IS NULL
  AND organization_id IS NULL;
```

### Update: `TeamWeeklyFocus.tsx`

- Import `useStaffProfile` to get the doctor's `organization_id` (either from the new column or from the existing location chain)
- Replace `.is('org_id', null)` with `.eq('org_id', orgId)` in the assignments query
- Replace `.eq('source', 'global')` with `.eq('source', 'org')` (since all assignments are org-scoped now)
- Pass `orgId` into the query key for proper cache invalidation

### Update: `supabase/functions/admin-users/index.ts`

- When creating a doctor via invite, also set `organization_id` on the staff record (resolved from the selected `group_id → practice_groups.organization_id`)

### Update: `useStaffProfile.tsx`

- Add `organization_id` to the staff select query so it's available directly (useful for roaming doctors where the location chain is null)

## Technical Details

| Change | File |
|---|---|
| Add `organization_id` column to `staff` | New migration |
| Backfill existing staff | Same migration |
| Set org on doctor invite | `admin-users/index.ts` |
| Include `organization_id` in profile query | `useStaffProfile.tsx` |
| Query org-scoped assignments | `TeamWeeklyFocus.tsx` |
| Expose `organizationId` for roaming doctors | `useUserRole.tsx` fallback |

