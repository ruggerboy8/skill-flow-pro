-- SEC-3 phase 1 -- BEFORE snapshot. Read-only. Run via the Supabase MCP
-- (or the dashboard SQL editor) BEFORE applying the phase 1 migration, to
-- confirm the hole is real. No writes.

-- 1. staff: authenticated and anon currently have UPDATE on every column,
--    including every privilege / tenancy / identity flag. Expect a wide
--    column list here, including is_org_admin, is_clinical_director,
--    is_doctor, role_id, organization_id, etc.
select grantee, privilege_type,
       string_agg(column_name, ', ' order by column_name) as columns
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'staff'
  and privilege_type = 'UPDATE'
  and grantee in ('authenticated', 'anon')
group by grantee, privilege_type
order by grantee;

-- 2. staff: specifically confirm authenticated can UPDATE the privilege
--    columns that let a participant self-promote. Expect every row present.
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

-- 3. The RLS policy that lets this happen: "Users can update own profile"
--    only pins is_coach and is_super_admin in its WITH CHECK. Every other
--    column, including is_org_admin / is_clinical_director / role_id, is
--    unrestricted by RLS for a caller updating their own row.
select policyname, cmd, qual, with_check
from pg_policies
where tablename = 'staff' and policyname = 'Users can update own profile';

-- 4. user_capabilities: the uc_admin_write policy shape today. Expect
--    with_check = null -- no WITH CHECK at all, so any org_admin (not just
--    super_admin) can write is_platform_admin on any row, including their
--    own.
select policyname, cmd, roles, qual, with_check
from pg_policies
where tablename = 'user_capabilities' and policyname = 'uc_admin_write';
