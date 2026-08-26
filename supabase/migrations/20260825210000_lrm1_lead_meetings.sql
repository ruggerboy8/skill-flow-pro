-- LRM-1: Lead RDA meeting records, in the week-spine "Meetings and Focus" tab.
-- Additive only (new table, nothing else references it yet), so this is safe to
-- (re)run any time. Author-only RLS mirroring coaching_issues (slice 1):
-- created_by = the caller's staff id, full CRUD, and NO other read path --
-- not even for super admins. The internal summary is a private record, by
-- decision (see docs/specs/lrm-lead-meeting-bulletin-and-doctor-roster.md,
-- "Decisions locked").

create table if not exists public.lead_meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  created_by uuid not null references public.staff(id),
  meeting_date date not null,
  week_start_date date not null,
  raw_transcript text,
  internal_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_lead_meetings_created_by on public.lead_meetings(created_by, week_start_date desc);
create index if not exists idx_lead_meetings_week on public.lead_meetings(organization_id, week_start_date desc);

grant select, insert, update, delete on public.lead_meetings to authenticated;

alter table public.lead_meetings enable row level security;

drop policy if exists "own lead meetings" on public.lead_meetings;
create policy "own lead meetings" on public.lead_meetings for all to authenticated
  using ( created_by = (select s.id from public.staff s where s.user_id = auth.uid()) )
  with check ( created_by = (select s.id from public.staff s where s.user_id = auth.uid()) );

-- Sanity check: table exists, RLS is on, and there is exactly one policy
-- (author-only, no broader read path -- confirms no super-admin or org-wide
-- policy was accidentally added alongside this one).
do $$
declare
  v_rls_enabled boolean;
  v_policy_count int;
begin
  select relrowsecurity into v_rls_enabled
    from pg_class where oid = 'public.lead_meetings'::regclass;
  if not v_rls_enabled then
    raise exception 'lead_meetings: row level security is not enabled';
  end if;

  select count(*) into v_policy_count
    from pg_policies where schemaname = 'public' and tablename = 'lead_meetings';
  if v_policy_count <> 1 then
    raise exception 'lead_meetings: expected exactly 1 policy, found %', v_policy_count;
  end if;

  raise notice 'lead_meetings: OK (RLS enabled, % policy)', v_policy_count;
end $$;
