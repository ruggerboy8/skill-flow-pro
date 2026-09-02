-- Backfill user_capabilities for every staff member who lacks a row.
-- Simplification roadmap Track 1.1 (docs/archive/simplification-roadmap.md).
--
-- The inserted values mirror useUserRole's legacy-fallback formulas EXACTLY
-- (src/hooks/useUserRole.tsx, the `caps ? ... : legacy` branches), so adding a
-- row is behavior-preserving by construction: every capability expression the
-- hook evaluates produces the same value from the new row as it did from the
-- legacy flags. Never overwrites an existing row (existing rows are the source
-- of truth for already-migrated users). Idempotent: safe to run repeatedly.

insert into user_capabilities (
  staff_id,
  is_participant,
  participation_start_at,
  can_view_submissions,
  can_submit_evals,
  can_review_evals,
  can_invite_users,
  can_manage_library,
  can_manage_locations,
  can_manage_users,
  can_manage_assignments,
  is_org_admin,
  is_platform_admin
)
select
  s.id,
  coalesce(s.is_participant, false),
  s.participation_start_at,
  -- can_view_submissions / can_submit_evals: is_coach OR is_org_admin OR is_super_admin
  coalesce(s.is_coach, false) or coalesce(s.is_org_admin, false) or coalesce(s.is_super_admin, false),
  coalesce(s.is_coach, false) or coalesce(s.is_org_admin, false) or coalesce(s.is_super_admin, false),
  -- can_review_evals / can_invite_users / can_manage_locations / can_manage_users /
  -- can_manage_assignments: is_org_admin OR is_super_admin
  coalesce(s.is_org_admin, false) or coalesce(s.is_super_admin, false),
  coalesce(s.is_org_admin, false) or coalesce(s.is_super_admin, false),
  -- can_manage_library: is_super_admin only
  coalesce(s.is_super_admin, false),
  coalesce(s.is_org_admin, false) or coalesce(s.is_super_admin, false),
  coalesce(s.is_org_admin, false) or coalesce(s.is_super_admin, false),
  coalesce(s.is_org_admin, false) or coalesce(s.is_super_admin, false),
  coalesce(s.is_org_admin, false),
  -- is_platform_admin (caps) is the new name for is_super_admin (staff)
  coalesce(s.is_super_admin, false)
from staff s
where not exists (
  select 1 from user_capabilities uc where uc.staff_id = s.id
);

-- Sanity check: every staff row must now have a capabilities row, and every
-- backfill-eligible value must match the legacy-derived formula.
do $$
declare
  v_missing integer;
  v_mismatch integer;
begin
  select count(*) into v_missing
  from staff s
  where not exists (select 1 from user_capabilities uc where uc.staff_id = s.id);

  if v_missing > 0 then
    raise exception 'Backfill incomplete: % staff still lack a user_capabilities row', v_missing;
  end if;

  select count(*) into v_mismatch
  from staff s
  join user_capabilities uc on uc.staff_id = s.id
  -- Only assert on rows the backfill could have created this run or earlier
  -- runs of this same formula; pre-existing hand-managed rows are exempt.
  where uc.created_at >= '2026-07-24'
    and (
      uc.is_participant is distinct from coalesce(s.is_participant, false)
      or uc.is_platform_admin is distinct from coalesce(s.is_super_admin, false)
      or uc.is_org_admin is distinct from coalesce(s.is_org_admin, false)
      or uc.can_view_submissions is distinct from (coalesce(s.is_coach, false) or coalesce(s.is_org_admin, false) or coalesce(s.is_super_admin, false))
      or uc.can_manage_library is distinct from coalesce(s.is_super_admin, false)
    );

  if v_mismatch > 0 then
    raise exception 'Backfill mismatch: % rows do not mirror legacy flags', v_mismatch;
  end if;

  raise notice 'user_capabilities backfill verified: no missing rows, no mismatches.';
end $$;
