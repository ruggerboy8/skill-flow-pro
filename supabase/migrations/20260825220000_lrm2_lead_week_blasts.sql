-- LRM-2: weekly doctor blast drafts and sends, anchored to the WEEK (not the
-- meeting), in the "Meetings and Focus" tab. Additive only, so this is safe
-- to (re)run any time. Author-only RLS mirroring lead_meetings (LRM-1) and
-- coaching_issues (slice 1): created_by = the caller's staff id, full CRUD,
-- and NO other read path -- not even for super admins (see
-- docs/specs/lrm-lead-meeting-bulletin-and-doctor-roster.md, "Decisions
-- locked"). Blasts are org-wide for now; location_id is a future-scoping
-- door, unused in v1 (see the column comment below).

create table if not exists public.lead_week_blasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  created_by uuid not null references public.staff(id),
  week_start_date date not null,
  body text not null default '',
  status text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at timestamptz,
  sent_by uuid references public.staff(id),
  recipient_count int,
  location_id uuid references public.locations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, week_start_date)
);

comment on column public.lead_week_blasts.location_id is
  'Future scoping door for location-specific blasts. Always null in v1 -- '
  'every blast is org-wide. Not read or written by any v1 code path.';

create index if not exists idx_lead_week_blasts_created_by on public.lead_week_blasts(created_by, week_start_date desc);
create index if not exists idx_lead_week_blasts_org_week on public.lead_week_blasts(organization_id, week_start_date desc);

grant select, insert, update, delete on public.lead_week_blasts to authenticated;

alter table public.lead_week_blasts enable row level security;

drop policy if exists "own lead week blasts" on public.lead_week_blasts;
create policy "own lead week blasts" on public.lead_week_blasts for all to authenticated
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
    from pg_class where oid = 'public.lead_week_blasts'::regclass;
  if not v_rls_enabled then
    raise exception 'lead_week_blasts: row level security is not enabled';
  end if;

  select count(*) into v_policy_count
    from pg_policies where schemaname = 'public' and tablename = 'lead_week_blasts';
  if v_policy_count <> 1 then
    raise exception 'lead_week_blasts: expected exactly 1 policy, found %', v_policy_count;
  end if;

  raise notice 'lead_week_blasts: OK (RLS enabled, % policy)', v_policy_count;
end $$;
