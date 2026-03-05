

## Plan: Rename `organizations` → `groups` in Database and Code

### The Problem
The database table is called `organizations` with `organization_id` foreign keys everywhere. When enterprise multi-tenancy is built, "organization" will mean the top-level tenant (e.g., "Alcan"). The current `organizations` table represents sub-groups (e.g., "Big Apple", "Kids Tooth Team MI"). Keeping both as "organization" in code will cause persistent confusion.

### Scope Assessment

This is a large but mechanical rename touching:
- **1 table**: `organizations` → `groups`
- **1 column on `locations`**: `organization_id` → `group_id`
- **~5 RPC functions** that return `organization_id`/`organization_name` columns
- **~10 views/functions** in SQL that JOIN on `organizations`
- **~42 TypeScript/TSX files** referencing `organization_id`, `organizationId`, `organization_name`
- **1 edge function** (`admin-users`) referencing `organization_id`
- **Types file** (`types.ts`) auto-regenerates from schema

### Recommended Approach: Phased Migration

**Phase 1 — Database rename (single migration)**
```sql
-- Rename table
ALTER TABLE organizations RENAME TO groups;

-- Rename FK column on locations
ALTER TABLE locations RENAME COLUMN organization_id TO group_id;

-- Rename FK constraint
ALTER TABLE locations RENAME CONSTRAINT locations_organization_id_fkey TO locations_group_id_fkey;

-- Recreate/update all affected RPC functions to use new names
-- (each function that references organizations or organization_id)
```

All RPC functions that return `organization_id`/`organization_name` columns need updating. Since RPCs define their own return types, the column aliases change too (e.g., `o.name AS group_name`).

**Phase 2 — Frontend code rename**
- All `.ts`/`.tsx` files: `organization_id` → `group_id`, `organizationId` → `groupId`, `organization_name` → `group_name`
- Type interfaces in `coachV2.ts`, `analytics.ts`, `evalMetricsV2.ts`, hooks, etc.
- Supabase query strings: `.from("organizations")` → `.from("groups")`
- Edge function `admin-users/index.ts`

**Phase 3 — Types regeneration**
After migration runs, `types.ts` auto-regenerates to reflect the new schema.

### Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Breaking RPC return types | Update all RPCs in the same migration |
| Missing a reference | Systematic grep-based search; TypeScript compiler will catch mismatches after types regenerate |
| RLS policies reference old names | Migration updates all policies |
| Edge function references | Update in same PR |
| Sequencer/planner functions use `org_id` | These already use `org_id` (not `organization_id`), so they're unaffected unless they JOIN `organizations` by name |

### Recommendation

This is worth doing **now**, before enterprise work begins. The migration is mechanical but large. I'd suggest we tackle it in two implementation messages:

1. **Database migration**: One SQL migration that renames the table, column, constraints, RLS policies, and all affected RPC functions
2. **Code update**: Rename all TypeScript references across ~42 files

Want me to proceed with this plan?

