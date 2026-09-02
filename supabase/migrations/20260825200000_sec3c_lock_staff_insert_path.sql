-- SEC-3c: close the self-promotion escalation via the staff INSERT path.
--
-- Background: SEC-3 phase 1 (20260819225559) locked the UPDATE path but left
-- INSERT open. A logged-in user could self-promote to org admin / clinical
-- director, or cross into another tenant, by INSERTing a SECOND staff row for
-- their own auth.uid() instead of updating their existing row, because:
--   1. `authenticated` (and `anon`) held the table INSERT grant on staff;
--   2. the INSERT policy "Users can create own profile" pinned only
--      user_id / is_coach / is_super_admin, leaving is_org_admin,
--      is_clinical_director, role_id, organization_id, coach_scope_* open;
--   3. there was no uniqueness on staff.user_id, so a user could hold two rows,
--      and every privilege gate reads staff by EXISTS across all rows for a
--      user_id, so the injected row is enough.
--
-- The app never inserts staff from the client. Verified 2026-08-25: no
-- `.from('staff').insert/upsert` anywhere in src/; all staff creation goes
-- through the admin-users edge function on the SERVICE ROLE (which bypasses
-- grants and RLS), and there is no handle_new_user signup trigger. So revoking
-- the client INSERT grant breaks no live code path.
--
-- This migration inverts the failed pattern the same way phase 1 did for UPDATE:
-- lock INSERT by default (loud-failing) rather than pinning specific columns.
--
-- Idempotent. Safe to run via the Supabase SQL Editor. No DELETE of platform
-- data. Does NOT need to lag a Lovable deploy (no deployed code path inserts
-- staff from the client).

-- 1. Remove the client INSERT grant. service_role and postgres keep it, so the
--    admin-users edge function is unaffected.
revoke insert on table public.staff from authenticated;
revoke insert on table public.staff from anon;

-- 2. Drop the pin-and-forget INSERT policy. With the grant gone it is already
--    dead, but leaving a policy that only pins 3 of ~34 columns is a landmine:
--    if a future migration ever re-grants INSERT to authenticated, this policy
--    would silently re-open the hole. Dropping it means a future accidental
--    re-grant fails LOUDLY (no INSERT policy -> RLS denies all inserts) instead.
drop policy if exists "Users can create own profile" on public.staff;

-- 3. Defense in depth: one staff row per auth user, enforced at the data layer
--    regardless of grants or policies. This directly kills the "second row"
--    mechanism even if a future change regresses the grant. Verified clean to
--    add on 2026-08-25: 114 rows, 0 null user_id, 0 duplicate user_id.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'staff_user_id_key'
      and conrelid = 'public.staff'::regclass
  ) then
    alter table public.staff add constraint staff_user_id_key unique (user_id);
  end if;
end $$;

-- Post-apply self-check: fail loudly if the lock did not take.
do $$
declare
  v_auth_insert int;
  v_anon_insert int;
  v_policy int;
  v_uniq int;
begin
  select count(*) into v_auth_insert
  from information_schema.role_table_grants
  where table_schema='public' and table_name='staff'
    and grantee='authenticated' and privilege_type='INSERT';

  select count(*) into v_anon_insert
  from information_schema.role_table_grants
  where table_schema='public' and table_name='staff'
    and grantee='anon' and privilege_type='INSERT';

  select count(*) into v_policy
  from pg_policies
  where schemaname='public' and tablename='staff'
    and policyname='Users can create own profile';

  select count(*) into v_uniq
  from pg_constraint
  where conname='staff_user_id_key' and conrelid='public.staff'::regclass;

  if v_auth_insert <> 0 then
    raise exception 'SEC-3c self-check FAILED: authenticated still has INSERT on staff';
  end if;
  if v_anon_insert <> 0 then
    raise exception 'SEC-3c self-check FAILED: anon still has INSERT on staff';
  end if;
  if v_policy <> 0 then
    raise exception 'SEC-3c self-check FAILED: legacy INSERT policy still present';
  end if;
  if v_uniq <> 1 then
    raise exception 'SEC-3c self-check FAILED: unique constraint on staff.user_id missing';
  end if;

  raise notice 'SEC-3c self-check passed: staff INSERT locked, legacy policy dropped, user_id unique.';
end $$;
