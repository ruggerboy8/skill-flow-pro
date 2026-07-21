-- Ariyana's Coaching Workspace — Slice 2 (Lead focus + scheduling).
-- Additive: new tables only, nothing else reads them, safe to (re)run any time.
-- Author-scoped RLS like Slice 1, plus a read path so leads can see the current
-- published focus and their own meeting requests. Org resolution via the existing
-- current_user_org_id() helper. Idempotent (IF NOT EXISTS / CREATE OR REPLACE).

-- ── Tables ──────────────────────────────────────────────────────────────────

-- One weekly focus per director per Monday. status 'draft' until she schedules it.
create table if not exists public.lead_focus_weeks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  created_by uuid references public.staff(id),
  week_start_date date not null,
  framing text,
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, week_start_date)
);

-- 1–2 focus items per week. text is the final, lead-ready phrasing. The outcome
-- shown in the record is DERIVED from the sourcing issue (its retired_outcome),
-- so we never store it here.
create table if not exists public.lead_focus_items (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.lead_focus_weeks(id) on delete cascade,
  organization_id uuid references public.organizations(id),
  display_order int not null check (display_order between 1 and 2),
  text text not null,
  source_issue_id uuid references public.coaching_issues(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (week_id, display_order)
);

-- Director → lead "let's find time" nudge. In-app record; the email is sent by the
-- lead-request-meeting edge function. status walks sent → opened → booked.
create table if not exists public.lead_meeting_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id),
  created_by uuid references public.staff(id),      -- the director (Ariyana)
  lead_staff_id uuid not null references public.staff(id),
  note text,
  status text not null default 'sent' check (status in ('sent','opened','booked')),
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  booked_at timestamptz
);

create index if not exists idx_lead_focus_weeks_creator on public.lead_focus_weeks(created_by, week_start_date desc);
create index if not exists idx_lead_focus_weeks_pub on public.lead_focus_weeks(organization_id, status, week_start_date desc);
create index if not exists idx_lead_focus_items_week on public.lead_focus_items(week_id);
create index if not exists idx_lead_meeting_requests_lead on public.lead_meeting_requests(lead_staff_id, status);
create index if not exists idx_lead_meeting_requests_creator on public.lead_meeting_requests(created_by, created_at desc);

grant select, insert, update, delete on public.lead_focus_weeks to authenticated;
grant select, insert, update, delete on public.lead_focus_items to authenticated;
grant select, insert, update, delete on public.lead_meeting_requests to authenticated;

alter table public.lead_focus_weeks enable row level security;
alter table public.lead_focus_items enable row level security;
alter table public.lead_meeting_requests enable row level security;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- helper expression used throughout: caller's staff id
--   (select s.id from public.staff s where s.user_id = auth.uid())

-- lead_focus_weeks: author (Ariyana) full control; leads in the same org read published weeks.
drop policy if exists "own focus weeks" on public.lead_focus_weeks;
create policy "own focus weeks" on public.lead_focus_weeks for all to authenticated
  using ( created_by = (select s.id from public.staff s where s.user_id = auth.uid()) )
  with check ( created_by = (select s.id from public.staff s where s.user_id = auth.uid()) );

drop policy if exists "leads read published focus weeks" on public.lead_focus_weeks;
create policy "leads read published focus weeks" on public.lead_focus_weeks for select to authenticated
  using (
    status = 'published'
    and organization_id = public.current_user_org_id()
    and exists (select 1 from public.staff s where s.user_id = auth.uid() and s.is_lead = true)
  );

-- lead_focus_items: follow the parent week's permissions.
drop policy if exists "own focus items" on public.lead_focus_items;
create policy "own focus items" on public.lead_focus_items for all to authenticated
  using ( exists (select 1 from public.lead_focus_weeks w where w.id = week_id
            and w.created_by = (select s.id from public.staff s where s.user_id = auth.uid())) )
  with check ( exists (select 1 from public.lead_focus_weeks w where w.id = week_id
            and w.created_by = (select s.id from public.staff s where s.user_id = auth.uid())) );

drop policy if exists "leads read published focus items" on public.lead_focus_items;
create policy "leads read published focus items" on public.lead_focus_items for select to authenticated
  using (
    exists (
      select 1 from public.lead_focus_weeks w
      where w.id = week_id
        and w.status = 'published'
        and w.organization_id = public.current_user_org_id()
    )
    and exists (select 1 from public.staff s where s.user_id = auth.uid() and s.is_lead = true)
  );

-- lead_meeting_requests: director owns; the target lead may read and update status.
drop policy if exists "director owns meeting requests" on public.lead_meeting_requests;
create policy "director owns meeting requests" on public.lead_meeting_requests for all to authenticated
  using ( created_by = (select s.id from public.staff s where s.user_id = auth.uid()) )
  with check ( created_by = (select s.id from public.staff s where s.user_id = auth.uid()) );

drop policy if exists "lead reads own meeting requests" on public.lead_meeting_requests;
create policy "lead reads own meeting requests" on public.lead_meeting_requests for select to authenticated
  using ( lead_staff_id = (select s.id from public.staff s where s.user_id = auth.uid()) );

drop policy if exists "lead updates own meeting request status" on public.lead_meeting_requests;
create policy "lead updates own meeting request status" on public.lead_meeting_requests for update to authenticated
  using ( lead_staff_id = (select s.id from public.staff s where s.user_id = auth.uid()) )
  with check ( lead_staff_id = (select s.id from public.staff s where s.user_id = auth.uid()) );

-- ── Publish RPC ─────────────────────────────────────────────────────────────
-- Atomic publish: upsert the week + its items, mark published, and for each
-- sourcing issue stamp a 'declared_focus' event and advance it to 'communicated'.
-- Runs as the caller (security invoker) so RLS still applies to every write.
create or replace function public.publish_lead_focus_week(
  p_week_start date,
  p_framing text,
  p_items jsonb  -- [{ "text": "...", "source_issue_id": "uuid"|null }]
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_staff uuid;
  v_org uuid;
  v_week_id uuid;
  v_item jsonb;
  v_order int := 0;
  v_issue uuid;
begin
  select s.id into v_staff from public.staff s where s.user_id = auth.uid();
  if v_staff is null then
    raise exception 'no staff record for caller';
  end if;
  v_org := public.current_user_org_id();

  insert into public.lead_focus_weeks (organization_id, created_by, week_start_date, framing, status, published_at)
  values (v_org, v_staff, p_week_start, nullif(p_framing, ''), 'published', now())
  on conflict (created_by, week_start_date) do update
    set framing = excluded.framing,
        status = 'published',
        published_at = now(),
        updated_at = now()
  returning id into v_week_id;

  -- replace items for this week
  delete from public.lead_focus_items where week_id = v_week_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_order := v_order + 1;
    v_issue := nullif(v_item->>'source_issue_id', '')::uuid;
    insert into public.lead_focus_items (week_id, organization_id, display_order, text, source_issue_id)
    values (v_week_id, v_org, v_order, v_item->>'text', v_issue);

    -- advance the sourcing issue to 'communicated' and record it on the issue timeline
    if v_issue is not null then
      update public.coaching_issues
        set stage = 'communicated', updated_at = now()
        where id = v_issue and stage = 'identified';
      insert into public.coaching_issue_events (issue_id, kind, body, by_staff)
      values (v_issue, 'declared_focus', 'Declared as this week''s lead focus', v_staff);
    end if;
  end loop;

  return v_week_id;
end;
$$;

grant execute on function public.publish_lead_focus_week(date, text, jsonb) to authenticated;
