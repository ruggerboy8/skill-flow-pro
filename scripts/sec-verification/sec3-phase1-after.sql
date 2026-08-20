-- SEC-3 phase 1 -- AFTER snapshot. Read-only. Run via the Supabase MCP (or
-- the dashboard SQL editor) AFTER applying the phase 1 migration, to confirm
-- the hole is closed. Same queries as sec3-phase1-before.sql so the diff is
-- obvious. No writes.

-- 1. staff: authenticated should now show UPDATE on exactly three columns
--    (name, primary_location_id, scheduling_link); anon should show no rows
--    at all.
select grantee, privilege_type,
       string_agg(column_name, ', ' order by column_name) as columns
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'staff'
  and privilege_type = 'UPDATE'
  and grantee in ('authenticated', 'anon')
group by grantee, privilege_type
order by grantee;

-- 2. staff: none of these privilege columns should appear anymore. Expect
--    zero rows.
select column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'staff'
  and grantee = 'authenticated' and privilege_type = 'UPDATE'
  and column_name in (
    'is_org_admin', 'is_clinical_director', 'is_doctor', 'is_lead',
    'is_office_manager', 'role_id', 'organization_id', 'coach_scope_type',
    'coach_scope_id', 'is_paused'
  )
order by column_name;

-- 3. The RLS policy is unchanged by this migration (grants are the fix,
--    not this policy) -- included for completeness / to show it was left
--    alone deliberately.
select policyname, cmd, qual, with_check
from pg_policies
where tablename = 'staff' and policyname = 'Users can update own profile';

-- 4. user_capabilities: uc_admin_write should now show a non-null
--    with_check that pins is_platform_admin and scopes org_admin writes to
--    their own org.
select policyname, cmd, roles, qual, with_check
from pg_policies
where tablename = 'user_capabilities' and policyname = 'uc_admin_write';

-- 5. Sanity: confirm authenticated still has the three writable columns
--    (Profile.tsx and DoctorLocationEditor.tsx should keep working).
select column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'staff'
  and grantee = 'authenticated' and privilege_type = 'UPDATE'
order by column_name;
-- Expect exactly: name, primary_location_id, scheduling_link
