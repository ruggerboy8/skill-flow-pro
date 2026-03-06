

## Run 4 Sequential Database Migrations

All SQL will be executed exactly as provided, using the database migration tool.

### Migration 1 — Create organizations table + role_code + organization_role_names
- Creates `organizations` table with RLS (INSERT/UPDATE policies only — no SELECT yet)
- Adds `role_code` column to `roles` and backfills 4 values
- Creates `organization_role_names` table with RLS
- Creates `resolve_role_display_name()` function

### Migration 2 — Link practice_groups to organizations
- Adds nullable `organization_id` column to `practice_groups`
- Creates index on the new column
- Creates `current_user_org_id()` function

### Migration 3 — Backfill Alcan and enforce NOT NULL
- Inserts Alcan org record with fixed UUID
- Updates all practice_groups to point to Alcan
- Sets `organization_id` to NOT NULL
- Adds `practice_type` column to `pro_moves`
- Validates no unlinked groups remain

### Migration 4 — Add SELECT policies
- Adds `org_select_own_or_superadmin` SELECT policy on `organizations`
- Adds `role_names_select_own_org` SELECT policy on `organization_role_names`
- These safely reference `practice_groups.organization_id` which now exists from Migration 2

### Notes
- Migration 3 contains data operations (INSERT/UPDATE) mixed with schema changes (ALTER). These will be run together in a single migration since they're interdependent.
- The `role_code` UPDATE statements in Migration 1 are also data operations but are tightly coupled to the schema change adding that column.
- No application code changes are included in this step — just the DB schema work.

