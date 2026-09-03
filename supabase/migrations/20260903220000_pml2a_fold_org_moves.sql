-- PML-2a: fold organization_pro_moves into pro_moves.
--
-- Org-custom moves become full peers of platform moves: recommendable,
-- materials-capable, version-tracked (docs/audits/tenant-model-audit-2026-09-03.md,
-- docs/specs/pml-2-tenant-content-unification.md). This migration ships in the
-- same PR as the owner-aware frontend, but is applied to the database AFTER
-- that frontend is deployed (deploy-order trap documented in the spec) so no
-- org ever sees another org's custom moves mid-rollout.
--
-- Idempotent: safe to re-run. The second run finds zero unmigrated
-- organization_pro_moves rows and zero weekly_assignments.org_move_id
-- references, so every step below is a no-op.

select set_config('app.change_reason', 'PML-2a: fold organization_pro_moves into pro_moves', true);

-- 1) Tracking column: records which pro_moves row a given organization_pro_moves
--    row was migrated to, so this migration (and the dual-read frontend code)
--    can tell a migrated row from one still waiting.
alter table public.organization_pro_moves
  add column if not exists migrated_action_id bigint references public.pro_moves(action_id) on delete set null;

-- 2) Insert every not-yet-migrated organization_pro_moves row (active AND
--    inactive — deactivated org moves keep their history too) into pro_moves
--    as an owned, org_custom row. Looped rather than a single INSERT...SELECT
--    so each source row can be stamped with the exact new action_id it
--    produced (live data is ~8 rows; a loop is more than fast enough and
--    much easier to reason about correctness for).
do $$
declare
  r record;
  v_new_action_id bigint;
begin
  for r in
    select *
    from public.organization_pro_moves
    where migrated_action_id is null
    order by created_at
  loop
    insert into public.pro_moves (
      owner_org_id, source, action_statement, description,
      role_id, competency_id, practice_types, active
    ) values (
      r.org_id, 'org_custom', r.action_statement, r.description,
      r.role_id, r.competency_id, r.practice_types, r.active
    )
    returning action_id into v_new_action_id;

    update public.organization_pro_moves
      set migrated_action_id = v_new_action_id
      where id = r.id;
  end loop;
end $$;

-- 3) Repoint weekly_assignments rows that reference the old org_move_id to
--    the new pro_moves.action_id, then null out org_move_id. This does not
--    touch weekly_assignments_check (the source/org_id/location_id CHECK
--    added in 20260312224749) — that constraint has nothing to do with
--    action_id/org_move_id, only source/org_id/location_id, so the repoint
--    below cannot violate it.
update public.weekly_assignments wa
set action_id = opm.migrated_action_id,
    org_move_id = null
from public.organization_pro_moves opm
where wa.org_move_id = opm.id
  and opm.migrated_action_id is not null;

-- 4) RLS carve-out: org admins may insert/update rows they own
--    (owner_org_id = their org). Platform rows (owner_org_id IS NULL) stay
--    locked to platform admins via the existing "Platform admins manage
--    pro_moves" policy from 20260727163955, which this migration leaves
--    untouched — Postgres OR's multiple permissive policies together for the
--    same command, so this is purely additive. Delete stays blocked for
--    platform rows by the existing framework_history delete-guard trigger;
--    org-owned rows (owner_org_id IS NOT NULL) are already exempt there, and
--    this policy's own owner_org_id check keeps org admins scoped to only
--    their own org's rows.
drop policy if exists "Org admins manage own org pro_moves" on public.pro_moves;

create policy "Org admins manage own org pro_moves"
on public.pro_moves
for all
using (
  owner_org_id is not null
  and owner_org_id = current_user_org_id()
  and exists (
    select 1 from public.staff s
    where s.user_id = auth.uid()
      and (coalesce(s.is_org_admin, false) or coalesce(s.is_super_admin, false))
  )
)
with check (
  owner_org_id is not null
  and owner_org_id = current_user_org_id()
  and exists (
    select 1 from public.staff s
    where s.user_id = auth.uid()
      and (coalesce(s.is_org_admin, false) or coalesce(s.is_super_admin, false))
  )
);

-- 5) Sanity checks.
do $$
declare
  v_remaining_org_move_refs int;
  v_migrated_count int;
  v_source_count int;
begin
  select count(*) into v_remaining_org_move_refs
  from public.weekly_assignments
  where org_move_id is not null;

  if v_remaining_org_move_refs > 0 then
    raise exception 'PML-2a sanity: % weekly_assignments rows still reference org_move_id', v_remaining_org_move_refs;
  end if;

  select count(*) into v_migrated_count from public.organization_pro_moves where migrated_action_id is not null;
  select count(*) into v_source_count from public.organization_pro_moves;

  if v_migrated_count <> v_source_count then
    raise exception 'PML-2a sanity: % of % organization_pro_moves rows migrated', v_migrated_count, v_source_count;
  end if;

  raise notice 'PML-2a: fold complete — % organization_pro_moves rows migrated, 0 weekly_assignments.org_move_id references remain', v_migrated_count;
end $$;
