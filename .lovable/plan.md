

# Enterprise Isolation Fix Plan

## Problem Summary

You're seeing bleedover because of two core issues:

1. **RLS policy "Authenticated users can read global assignments"** allows ALL authenticated users to read `weekly_assignments` where `source = 'global' AND org_id IS NULL`. Since all 96 of Alcan's locked assignments have `org_id = NULL`, every user in every org can see them.

2. **`assembleWeek()` in `locationState.ts`** is hardcoded to query `source = 'global' AND org_id IS NULL`, meaning staff in any org get served Alcan's assignments as their weekly work.

Per your clarification: there should be **no fallback**. Each organization is a fully independent tenant. If Test Org hasn't assigned any pro moves, their staff see zero assignments.

---

## Changes Required

### 1. Migrate Alcan's existing assignments to be org-scoped

Alcan's 96 locked global assignments currently have `org_id = NULL`. These need to be stamped with Alcan's `organization_id` so they're properly scoped.

```sql
-- Backfill Alcan's org_id onto existing global assignments
UPDATE weekly_assignments
SET org_id = '<alcan_org_id>',
    source = 'org'
WHERE source = 'global'
  AND org_id IS NULL
  AND status = 'locked';
```

### 2. Update RLS policies on `weekly_assignments`

- **Drop** "Authenticated users can read global assignments" (the `source = 'global' AND org_id IS NULL` policy) — no more unscoped global assignments.
- **Fix** "Users view own org global assignments" — currently broken because it resolves org via `l.group_id` instead of joining through `practice_groups.organization_id`.
- **Add** a new policy for `source = 'org'` reads using a `SECURITY DEFINER` function to avoid recursion.
- **Add** org-admin write policies for `weekly_assignments` so org admins can manage their org's assignments.

### 3. Add org-admin write RLS for `practice_groups` and `locations`

Currently both tables only allow writes via `is_superadmin()`. Org admins need INSERT/UPDATE/DELETE scoped to their own organization.

Create a `SECURITY DEFINER` helper function:
```sql
CREATE OR REPLACE FUNCTION public.get_user_org_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg.organization_id
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  JOIN practice_groups pg ON pg.id = l.group_id
  WHERE s.user_id = p_user_id
  LIMIT 1;
$$;
```

Then add policies:
- `practice_groups`: org admin can INSERT/UPDATE/DELETE where `organization_id = get_user_org_id(auth.uid())`
- `locations`: org admin can INSERT/UPDATE/DELETE where `group_id` belongs to `practice_groups` with matching `organization_id`

### 4. Update `assembleWeek()` in `locationState.ts`

Remove the hardcoded `source = 'global'` / `org_id IS NULL` filter. Instead:
1. Resolve the location's `organization_id` via `practice_groups`
2. Query `weekly_assignments` where `org_id = orgId` (no fallback)
3. Accept any `source` value (`'org'` or `'global'`) — what matters is the `org_id` match

### 5. Update `GlobalAssignmentBuilder` to save with `org_id`

The `GlobalAssignmentBuilder` (used from the old admin flow) hardcodes `source: 'global'` and `org_id: null`. Update it to resolve the user's `organizationId` from `useUserRole()` and save with `org_id` set and `source: 'org'`.

### 6. Add `weekly_assignments` SELECT policy for `source = 'org'`

```sql
CREATE POLICY "Users view own org assignments"
ON public.weekly_assignments FOR SELECT TO authenticated
USING (
  source = 'org' AND
  org_id = public.get_user_org_id(auth.uid())
);
```

---

## Files to Change

| File | Change |
|------|--------|
| New migration SQL | SECURITY DEFINER `get_user_org_id()`, RLS policies for `weekly_assignments`, `practice_groups`, `locations`; backfill Alcan assignments |
| `src/lib/locationState.ts` | `assembleWeek()` — resolve org_id, query by org_id, no fallback |
| `src/components/admin/GlobalAssignmentBuilder.tsx` | Save with `org_id` from `useUserRole()`, set `source: 'org'` |

---

## What This Does NOT Change

- The `planner-upsert` edge function already correctly sets `org_id` and `source: 'org'` when `orgId` is provided — no changes needed.
- `WeekBuilderPanel` already scopes queries by `orgId` — no changes needed.
- Pro Move Library isolation already works via `organization_pro_move_overrides`.
- Admin-users invite scoping already works via `current_user_org_id` RPC.

