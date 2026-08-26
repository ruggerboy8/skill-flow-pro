-- DR-1: coaching enrollment designation on the doctor roster
--
-- Adds an explicit "is this doctor being coached" flag, separate from
-- "does this doctor have a login." A null coaching_enrolled_at means not
-- enrolled; a timestamp records when enrollment happened (and by whom).
-- Idempotent: safe to run more than once.
--
-- Note on coaching_enrolled_by: staff.baseline_released_by (added in
-- migration 20260304174054) references auth.users(id), but the wizard that
-- reads it back (BaselineWizard.tsx) looks it up as a staff.id, so the
-- releaser's name never resolves ("Your Coach" fallback). That is a known
-- latent bug slated for DR-2. To avoid repeating it, coaching_enrolled_by
-- here references public.staff(id) directly -- the admin-users edge
-- function that writes it (set_coaching_enrollment) always has the caller's
-- staff id on hand, so there is no reason to store the auth uid instead.

select set_config('app.change_reason', 'DR-1: add coaching enrollment designation to staff', true);

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Add columns
-- ─────────────────────────────────────────────────────────────────────────

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff' and column_name = 'coaching_enrolled_at'
  ) then
    alter table public.staff add column coaching_enrolled_at timestamptz default null;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff' and column_name = 'coaching_enrolled_by'
  ) then
    alter table public.staff add column coaching_enrolled_by uuid default null references public.staff(id);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Backfill: any doctor with existing coaching activity is enrolled.
--    coaching_enrolled_by stays null for backfilled rows (no human made
--    this specific decision; it is a data-driven default, not an action).
--    Re-running this UPDATE is harmless -- the WHERE clause only ever
--    touches rows that are still unenrolled.
-- ─────────────────────────────────────────────────────────────────────────

update public.staff s
set coaching_enrolled_at = now()
where s.is_doctor = true
  and s.coaching_enrolled_at is null
  and (
    s.baseline_released_at is not null
    or exists (select 1 from public.doctor_baseline_assessments dba where dba.doctor_staff_id = s.id)
    or exists (select 1 from public.coach_baseline_assessments cba where cba.doctor_staff_id = s.id)
    or exists (select 1 from public.coaching_sessions cs where cs.doctor_staff_id = s.id)
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3. SEC-3 privilege-column lock: extend to the two new columns.
--
--    Mechanism (mirroring 20260819225559_sec3_phase1_lock_staff_privilege_columns.sql):
--    that migration did `revoke update on public.staff from authenticated, anon`
--    at the TABLE level, then granted UPDATE back only on the three columns
--    the client legitimately writes (name, scheduling_link,
--    primary_location_id). Because the revoke was table-wide, any column
--    added to staff AFTER that migration -- including the two added here --
--    starts with no UPDATE grant for authenticated/anon at all; there is no
--    default privilege to inherit. So coaching_enrolled_at and
--    coaching_enrolled_by are already locked down by the existing mechanism
--    with no new REVOKE required.
--
--    The two statements below are a defensive, idempotent no-op (revoking a
--    privilege that was never granted is not an error) that makes the lock
--    explicit for these two columns rather than relying on silence, and the
--    sanity check after it proves the lock actually holds instead of just
--    assuming the table-wide revoke still covers it.
-- ─────────────────────────────────────────────────────────────────────────

revoke update (coaching_enrolled_at, coaching_enrolled_by) on public.staff from authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Sanity checks
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare
  bad_count int;
  unenrolled_with_activity int;
begin
  -- authenticated must have NO update grant on the two new columns
  select count(*) into bad_count
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'staff'
    and grantee = 'authenticated' and privilege_type = 'UPDATE'
    and column_name in ('coaching_enrolled_at', 'coaching_enrolled_by');
  if bad_count > 0 then
    raise exception 'DR-1 sanity check failed: authenticated has UPDATE on a coaching_enrolled_* column';
  end if;

  -- anon must have NO update grant on the two new columns
  select count(*) into bad_count
  from information_schema.column_privileges
  where table_schema = 'public' and table_name = 'staff'
    and grantee = 'anon' and privilege_type = 'UPDATE'
    and column_name in ('coaching_enrolled_at', 'coaching_enrolled_by');
  if bad_count > 0 then
    raise exception 'DR-1 sanity check failed: anon has UPDATE on a coaching_enrolled_* column';
  end if;

  -- every doctor with a coaching_sessions row must now be enrolled
  select count(*) into unenrolled_with_activity
  from public.staff s
  where s.is_doctor = true
    and s.coaching_enrolled_at is null
    and exists (select 1 from public.coaching_sessions cs where cs.doctor_staff_id = s.id);
  if unenrolled_with_activity > 0 then
    raise exception 'DR-1 sanity check failed: % doctor(s) with a coaching_sessions row are still unenrolled', unenrolled_with_activity;
  end if;

  raise notice 'DR-1 sanity checks passed.';
end $$;
