-- SEC-9a: revoke TRUNCATE on all public tables from anon and authenticated.
--
-- Context: anon and authenticated hold the full DML grant set (incl. TRUNCATE)
-- on ~70 of 72 public tables. This comes from Supabase's default privileges on
-- the public schema, not a one-off mistake, and Supabase's model relies on RLS
-- as the security layer. Verified 2026-08-26: zero public tables have RLS
-- disabled, so the model is intact and no table is directly exposed.
--
-- TRUNCATE is the one privilege in that set that RLS cannot gate (it is
-- table-level, not row-level) AND that nothing legitimately needs: PostgREST
-- exposes no TRUNCATE verb, the app never truncates, and no SECURITY INVOKER
-- function issues it. So revoking it from the client roles is pure hardening
-- that cannot break any path. service_role and postgres keep TRUNCATE.
--
-- This does NOT touch DELETE/INSERT/UPDATE (those are RLS-gated and some are
-- legitimately used by the client); a per-table RLS-policy audit for those is
-- SEC-9b. Idempotent, safe to re-run. No data change. No deploy dependency.

-- Drive the revoke off the actual grant list so it covers every object that
-- currently holds TRUNCATE for the client roles, ordinary tables AND views (a
-- handful of views carry the grant too; TRUNCATE on a view is a no-op but the
-- ACL entry exists and should be cleared for a clean state). REVOKE ... ON TABLE
-- is the correct syntax for views as well.
do $$
declare r record;
begin
  for r in
    select distinct g.table_name
    from information_schema.role_table_grants g
    where g.table_schema = 'public'
      and g.privilege_type = 'TRUNCATE'
      and g.grantee in ('anon', 'authenticated')
  loop
    execute format(
      'revoke truncate on table public.%I from authenticated, anon',
      r.table_name
    );
  end loop;
end $$;

-- Post-apply self-check: no public table may retain TRUNCATE for the client roles.
do $$
declare v_remaining int;
begin
  select count(*) into v_remaining
  from information_schema.role_table_grants
  where table_schema = 'public'
    and privilege_type = 'TRUNCATE'
    and grantee in ('anon', 'authenticated');

  if v_remaining <> 0 then
    raise exception 'SEC-9a self-check FAILED: % TRUNCATE grants to anon/authenticated remain on public tables', v_remaining;
  end if;

  raise notice 'SEC-9a self-check passed: no anon/authenticated TRUNCATE on any public table.';
end $$;
