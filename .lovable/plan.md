

## Comprehensive FK Join Hint Audit

### Problem Found

The database has **two** FK constraints from `locations` to `practice_groups`:
1. **`locations_org_fkey`** — the original constraint (renamed column `organization_id` → `group_id`)
2. **`locations_organization_id_fkey`** — appears to be a second/duplicate constraint

Because there are multiple FKs pointing to the same table, PostgREST **requires** an explicit hint (`!constraint_name`) to disambiguate. Some files use the correct `!locations_org_fkey`, others use a non-existent `!locations_group_id_fkey`, and one file has corrupted select syntax.

### Issues to Fix

**1. Wrong FK hint name (will fail at runtime)**
These files reference `locations_group_id_fkey` which does not exist as a constraint:

| File | Line |
|------|------|
| `src/hooks/useEvalDeliveryProgress.tsx` | 62 |
| `src/pages/coach/RemindersTab.tsx` | 148 |

Fix: Change `!locations_group_id_fkey` → `!locations_org_fkey`

**2. Corrupted select syntax (double alias, double parentheses)**
`src/components/admin/AdminLocationsTab.tsx` line 50 has:
```
practice_group:practice_group:practice_groups!locations_org_fkey ( name ) ( name )
```
This has a double alias (`practice_group:practice_group:`) and double column list (`( name ) ( name )`). Should be:
```
practice_group:practice_groups!locations_org_fkey(name)
```

**3. No issues (already correct)**
- `src/components/admin/AdminUsersTab.tsx` — uses `!locations_org_fkey` ✓
- All `scope_organization_id` references — intentional audit table column ✓
- `supabase/functions/admin-users/index.ts` `organization_id` — backward compat ✓

### Summary

3 files need fixing, all with the same root cause: incorrect or malformed FK join hints for the `locations` → `practice_groups` relationship. The correct constraint name is `locations_org_fkey`.

