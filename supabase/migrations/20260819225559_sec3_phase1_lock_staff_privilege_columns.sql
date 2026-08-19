-- SEC-3 phase 1: close the self-promotion / privilege-escalation hole on
-- public.staff, and pin the critical is_platform_admin escalation hole on
-- public.user_capabilities. Idempotent (safe to re-run).
--
-- The problem: the "Users can update own profile" RLS policy on staff only
-- pins is_coach and is_super_admin back to their current values (via
-- get_own_staff_flags()) in its WITH CHECK. It does not pin is_org_admin,
-- is_clinical_director, is_doctor, is_lead, is_office_manager, role_id,
-- organization_id, coach_scope_type/id, is_paused, or any other privilege /
-- tenancy / identity column. RLS cannot express column-level restrictions,
-- so any authenticated caller updating their own staff row (user_id =
-- auth.uid()) could set any of those columns, including granting themselves
-- is_clinical_director or is_org_admin. Verified live 2026-08-19: both
-- `authenticated` and `anon` held UPDATE on all 33 columns of public.staff.
--
-- The fix for staff: revoke UPDATE from authenticated and anon on every
-- column, then grant back only the three columns the app actually needs to
-- write from the client: name and scheduling_link (the only two columns
-- src/pages/Profile.tsx writes) and primary_location_id (written by
-- src/components/clinical/DoctorLocationEditor.tsx, gated client-side only
-- today; closing that one properly is SEC-3 phase 2, not this migration).
-- Column-level GRANT/REVOKE is checked by Postgres before RLS is evaluated,
-- so this closes the hole regardless of which staff UPDATE policy matches.
--
-- The problem on user_capabilities: the uc_admin_write policy (FOR ALL) lets
-- any caller who is already staff.is_org_admin OR staff.is_super_admin write
-- any column on any user_capabilities row, with no WITH CHECK narrowing it.
-- That means an org_admin (an org-scoped role) can set is_platform_admin
-- (a platform-wide role) on their own row, self-escalating past org_admin to
-- platform admin. The legitimate write path (the admin-users edge function)
-- uses the Supabase service-role key, which bypasses RLS entirely, so this
-- policy is a defense-in-depth backstop for direct client calls, not the
-- path real admin actions take -- tightening it does not touch that flow.
--
-- The fix: add a WITH CHECK that (a) blocks a caller from setting
-- is_platform_admin = true on their own row unless they are already a
-- super admin, and (b) scopes org_admin writes to their own org (a super
-- admin is exempt from the org scope, since super admins legitimately
-- manage capabilities across orgs).

select set_config('app.change_reason', 'SEC-3 phase 1: lock staff privilege columns + pin user_capabilities self-promotion hole', true);

-- ─────────────────────────────────────────────────────────────────────────
-- 1. public.staff column grants
-- ─────────────────────────────────────────────────────────────────────────

-- Idempotent: REVOKE on a privilege already absent is a no-op, and REVOKE
-- ALL then GRANT the safe subset back leaves the same end state on rerun.
revoke update on public.staff from authenticated, anon;
grant update (name, scheduling_link, primary_location_id) on public.staff to authenticated;
-- anon retains no UPDATE on staff at all (no legitimate anonymous write path).

-- ─────────────────────────────────────────────────────────────────────────
-- 2. public.user_capabilities: pin the uc_admin_write policy
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists uc_admin_write on public.user_capabilities;

create policy uc_admin_write on public.user_capabilities
  for all
  using (
    exists (
      select 1 from public.staff
      where staff.user_id = auth.uid()
        and (staff.is_super_admin = true or staff.is_org_admin = true)
    )
  )
  with check (
    -- Preserve the original gate: caller must be a super admin or org admin.
    exists (
      select 1 from public.staff
      where staff.user_id = auth.uid()
        and (staff.is_super_admin = true or staff.is_org_admin = true)
    )
    -- (a) is_platform_admin pin: is_platform_admin may only be set true by a
    -- caller who is ALREADY a super admin, for ANY target row. There is no
    -- same-row-only escape: allowing it on another row let an org_admin grant
    -- platform admin to a second account they control and sign in as it
    -- (PR #32, Codex P1).
    and (
      is_platform_admin is distinct from true
      or exists (
        select 1 from public.staff
        where staff.user_id = auth.uid() and staff.is_super_admin = true
      )
    )
    -- (b) org scoping: an org_admin (not a super admin) may only write
    -- user_capabilities rows belonging to staff in their own org. Super
    -- admins are exempt -- they legitimately manage capabilities across
    -- orgs, and the real write path (admin-users edge function) uses the
    -- service-role key and bypasses RLS entirely, so this only constrains
    -- direct client calls under an org_admin session.
    and (
      exists (
        select 1 from public.staff
        where staff.user_id = auth.uid() and staff.is_super_admin = true
      )
      or exists (
        select 1
        from public.staff caller
        join public.staff target on target.id = user_capabilities.staff_id
        where caller.user_id = auth.uid()
          and caller.organization_id is not null
          and target.organization_id = caller.organization_id
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Sanity checks -- fail loudly if the post-state isn't what we expect.
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare
  locked_cols text[] := array[
    'is_org_admin', 'is_clinical_director', 'is_doctor', 'is_lead',
    'is_office_manager', 'is_participant', 'is_super_admin', 'is_coach',
    'role_id', 'organization_id', 'location', 'organization', 'user_id', 'id',
    'coach_scope_type', 'coach_scope_id', 'baseline_released_at',
    'baseline_released_by', 'allow_backfill_until', 'is_paused',
    'pause_reason', 'paused_at', 'participation_start_at', 'created_at',
    'updated_at', 'roles_updated_at', 'first_login_at', 'home_route',
    'pwa_enabled', 'email', 'hire_date'
  ];
  writable_cols text[] := array['name', 'scheduling_link', 'primary_location_id'];
  col text;
  bad_count int;
begin
  -- authenticated must have LOST update on every locked column
  foreach col in array locked_cols loop
    select count(*) into bad_count
    from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'staff'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'
      and column_name = col;
    if bad_count > 0 then
      raise exception 'SEC-3 phase 1 sanity check failed: authenticated still has UPDATE on staff.%', col;
    end if;

    select count(*) into bad_count
    from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'staff'
      and grantee = 'anon' and privilege_type = 'UPDATE'
      and column_name = col;
    if bad_count > 0 then
      raise exception 'SEC-3 phase 1 sanity check failed: anon still has UPDATE on staff.%', col;
    end if;
  end loop;

  -- anon must have NO update at all on staff
  select count(*) into bad_count
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'staff'
    and grantee = 'anon' and privilege_type = 'UPDATE';
  if bad_count > 0 then
    raise exception 'SEC-3 phase 1 sanity check failed: anon retains % UPDATE grant(s) on staff', bad_count;
  end if;

  -- authenticated must still have UPDATE on the three writable columns
  foreach col in array writable_cols loop
    select count(*) into bad_count
    from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'staff'
      and grantee = 'authenticated' and privilege_type = 'UPDATE'
      and column_name = col;
    if bad_count = 0 then
      raise exception 'SEC-3 phase 1 sanity check failed: authenticated lost UPDATE on staff.% (should stay writable)', col;
    end if;
  end loop;

  -- uc_admin_write policy must exist and now carry a with_check
  if not exists (
    select 1 from pg_policies
    where tablename = 'user_capabilities' and policyname = 'uc_admin_write'
      and with_check is not null
  ) then
    raise exception 'SEC-3 phase 1 sanity check failed: uc_admin_write has no with_check clause';
  end if;

  raise notice 'SEC-3 phase 1 sanity checks passed.';
end $$;
