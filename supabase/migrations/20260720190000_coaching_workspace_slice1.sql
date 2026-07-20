-- Ariyana's Coaching Workspace — Slice 1 (additive; new tables only).
-- Applied to prod 2026-07-20 via the Supabase MCP; kept here for version control.
-- Nothing else references these tables, so this is safe to (re)run any time.
-- Per-owner RLS (each user sees only their own issues); the /training surface is
-- gated to super admins in the frontend.

create table if not exists public.coaching_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  created_by uuid references public.staff(id),
  title text not null,
  detail text,
  stage text not null default 'identified' check (stage in ('identified','communicated','assessed')),
  is_global boolean not null default false,
  status text not null default 'active' check (status in ('active','retired')),
  retired_outcome text check (retired_outcome in ('landed','let_go','recurring')),
  retired_note text,
  private_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  retired_at timestamptz
);

create table if not exists public.coaching_issue_locations (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.coaching_issues(id) on delete cascade,
  location_id uuid not null references public.locations(id),
  unique (issue_id, location_id)
);

create table if not exists public.coaching_issue_sources (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.coaching_issues(id) on delete cascade,
  source_type text not null check (source_type in ('visit','doctor','leads','signal')),
  unique (issue_id, source_type)
);

create table if not exists public.coaching_issue_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.coaching_issues(id) on delete cascade,
  kind text not null check (kind in ('created','stage_change','note','declared_focus','retired','reopened')),
  body text,
  by_staff uuid references public.staff(id),
  at timestamptz not null default now()
);

create index if not exists idx_coaching_issues_created_by on public.coaching_issues(created_by);
create index if not exists idx_coaching_issue_locations_issue on public.coaching_issue_locations(issue_id);
create index if not exists idx_coaching_issue_sources_issue on public.coaching_issue_sources(issue_id);
create index if not exists idx_coaching_issue_events_issue on public.coaching_issue_events(issue_id);

grant select, insert, update, delete on public.coaching_issues to authenticated;
grant select, insert, update, delete on public.coaching_issue_locations to authenticated;
grant select, insert, update, delete on public.coaching_issue_sources to authenticated;
grant select, insert, update, delete on public.coaching_issue_events to authenticated;

alter table public.coaching_issues enable row level security;
alter table public.coaching_issue_locations enable row level security;
alter table public.coaching_issue_sources enable row level security;
alter table public.coaching_issue_events enable row level security;

drop policy if exists "own coaching issues" on public.coaching_issues;
create policy "own coaching issues" on public.coaching_issues for all to authenticated
  using ( created_by = (select s.id from public.staff s where s.user_id = auth.uid()) )
  with check ( created_by = (select s.id from public.staff s where s.user_id = auth.uid()) );

drop policy if exists "own issue locations" on public.coaching_issue_locations;
create policy "own issue locations" on public.coaching_issue_locations for all to authenticated
  using ( exists (select 1 from public.coaching_issues i where i.id = issue_id and i.created_by = (select s.id from public.staff s where s.user_id = auth.uid())) )
  with check ( exists (select 1 from public.coaching_issues i where i.id = issue_id and i.created_by = (select s.id from public.staff s where s.user_id = auth.uid())) );

drop policy if exists "own issue sources" on public.coaching_issue_sources;
create policy "own issue sources" on public.coaching_issue_sources for all to authenticated
  using ( exists (select 1 from public.coaching_issues i where i.id = issue_id and i.created_by = (select s.id from public.staff s where s.user_id = auth.uid())) )
  with check ( exists (select 1 from public.coaching_issues i where i.id = issue_id and i.created_by = (select s.id from public.staff s where s.user_id = auth.uid())) );

drop policy if exists "own issue events" on public.coaching_issue_events;
create policy "own issue events" on public.coaching_issue_events for all to authenticated
  using ( exists (select 1 from public.coaching_issues i where i.id = issue_id and i.created_by = (select s.id from public.staff s where s.user_id = auth.uid())) )
  with check ( exists (select 1 from public.coaching_issues i where i.id = issue_id and i.created_by = (select s.id from public.staff s where s.user_id = auth.uid())) );
