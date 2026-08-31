-- ASG-1 Fix 2: one canonical org timezone for the weekly-assignment week key.
--
-- weekly_assignments rows are org-level (location_id is null), but the write
-- side (planner) previously computed week_start_date in hardcoded
-- America/Chicago while the read side (locationState.assembleWeek) computed
-- its lookup Monday in each staff member's LOCATION timezone. Alcan spans
-- three timezones across 12 locations, so a Denver or New York location
-- could compute a different Monday than the Central Monday the planner
-- wrote and see nothing (docs/specs/asg-1-weekly-assignment-visibility.md,
-- Fix 2, option A).
--
-- This column becomes the single canonical timezone both write and read use
-- to compute the assignment-lookup week key (src/lib/submissionPolicy.ts,
-- getAssignmentWeekMondayStr). Per-location timezone is untouched and keeps
-- driving due-date/deadline display.
--
-- Idempotent: safe to run more than once.
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name = 'timezone'
  ) then
    alter table public.organizations
      add column timezone text not null default 'America/Chicago';
  end if;
end $$;

comment on column public.organizations.timezone is
  'Canonical timezone used to compute the weekly_assignments week_start_date '
  'key on both write (planner/auto-assign) and read (locationState.assembleWeek). '
  'Per-location timezone still drives due-date/deadline display and is unaffected. '
  'Every existing org defaults to America/Chicago because every existing '
  'weekly_assignments row was written in that timezone. Changing an org to a '
  'non-Central timezone (e.g. Europe/London for a UK org) is safe ONLY for an '
  'org with no pre-existing Chicago-written assignment rows, or must coincide '
  'with regenerating that org''s weeks. Do not set it here for Confident '
  'Dentist Academy or Avenue Dental; that is a follow-up, not part of this fix.';

-- Sanity check: every org must have a non-null timezone after backfill.
do $$
declare
  missing_count integer;
begin
  select count(*) into missing_count
  from public.organizations
  where timezone is null;

  if missing_count > 0 then
    raise exception 'ASG-1 Fix 2: % organizations still have a null timezone after backfill', missing_count;
  end if;
end $$;
