-- Ask Alcan — lightweight surveys/polls built on the pro-moves surface.
-- HR (super admins in the Alcan org) create/schedule/distribute surveys; staff
-- complete them from a persistent home card. Per-survey anonymity toggle:
-- completion is always tracked per-person (survey_assignments) so admins get
-- % complete and can chase non-responders, but answers (survey_responses) only
-- carry staff_id when the survey is attributed — never when anonymous.
--
-- Idempotent: safe to re-run.

-- ─── Tables ──────────────────────────────────────────────────────────────────

create table if not exists public.surveys (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id),
  created_by          uuid references public.staff(id),
  title               text not null,
  description         text,
  status              text not null default 'draft'
                        check (status in ('draft','open','closed')),
  is_anonymous        boolean not null default false,
  opens_at            timestamptz,
  closes_at           timestamptz,
  target_location_ids uuid[] not null default '{}',
  target_role_ids     int[]  not null default '{}',
  published_at        timestamptz,
  closed_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.survey_questions (
  id          uuid primary key default gen_random_uuid(),
  survey_id   uuid not null references public.surveys(id) on delete cascade,
  position    int  not null default 0,
  type        text not null
                check (type in ('single_choice','multi_choice','free_text','rating')),
  prompt      text not null,
  required    boolean not null default true,
  -- config: { choices: ["A","B"] } for choice types;
  --         { min, max, minLabel, maxLabel } for rating (NPS = 0..10)
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.survey_assignments (
  id           uuid primary key default gen_random_uuid(),
  survey_id    uuid not null references public.surveys(id) on delete cascade,
  staff_id     uuid not null references public.staff(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','completed')),
  assigned_at  timestamptz not null default now(),
  completed_at timestamptz,
  unique (survey_id, staff_id)
);

create table if not exists public.survey_responses (
  id           uuid primary key default gen_random_uuid(),
  survey_id    uuid not null references public.surveys(id) on delete cascade,
  -- NULL when the survey is anonymous; set to the responder otherwise.
  staff_id     uuid references public.staff(id) on delete set null,
  submitted_at timestamptz not null default now()
);

create table if not exists public.survey_answers (
  id          uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.survey_responses(id) on delete cascade,
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  -- value: array of choice strings | "free text" | number (rating)
  value       jsonb
);

create index if not exists idx_survey_questions_survey   on public.survey_questions(survey_id);
create index if not exists idx_survey_assignments_staff  on public.survey_assignments(staff_id, status);
create index if not exists idx_survey_assignments_survey on public.survey_assignments(survey_id);
create index if not exists idx_survey_responses_survey   on public.survey_responses(survey_id);
create index if not exists idx_survey_answers_response   on public.survey_answers(response_id);
create index if not exists idx_survey_answers_question   on public.survey_answers(question_id);

-- ─── updated_at trigger ──────────────────────────────────────────────────────

create or replace function public.survey_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_surveys_updated_at on public.surveys;
create trigger trg_surveys_updated_at
  before update on public.surveys
  for each row execute function public.survey_set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.surveys             enable row level security;
alter table public.survey_questions    enable row level security;
alter table public.survey_assignments  enable row level security;
alter table public.survey_responses    enable row level security;
alter table public.survey_answers      enable row level security;

-- surveys: super admins manage surveys in their own org; staff can read a survey
-- only when they have an assignment to it and it is currently open.
drop policy if exists surveys_admin_all on public.surveys;
create policy surveys_admin_all on public.surveys
  for all
  using (public.is_superadmin() and organization_id = public.current_user_org_id())
  with check (public.is_superadmin() and organization_id = public.current_user_org_id());

drop policy if exists surveys_staff_select on public.surveys;
create policy surveys_staff_select on public.surveys
  for select
  using (
    status = 'open'
    and exists (
      select 1 from public.survey_assignments a
      where a.survey_id = surveys.id
        and a.staff_id = public.get_current_staff_id()
    )
  );

-- survey_questions: admins manage; staff read questions of surveys they may read.
drop policy if exists survey_questions_admin_all on public.survey_questions;
create policy survey_questions_admin_all on public.survey_questions
  for all
  using (exists (
    select 1 from public.surveys s
    where s.id = survey_questions.survey_id
      and public.is_superadmin()
      and s.organization_id = public.current_user_org_id()
  ))
  with check (exists (
    select 1 from public.surveys s
    where s.id = survey_questions.survey_id
      and public.is_superadmin()
      and s.organization_id = public.current_user_org_id()
  ));

drop policy if exists survey_questions_staff_select on public.survey_questions;
create policy survey_questions_staff_select on public.survey_questions
  for select
  using (exists (
    select 1 from public.surveys s
    join public.survey_assignments a on a.survey_id = s.id
    where s.id = survey_questions.survey_id
      and s.status = 'open'
      and a.staff_id = public.get_current_staff_id()
  ));

-- survey_assignments: admins see all in their org; staff see their own.
drop policy if exists survey_assignments_admin_all on public.survey_assignments;
create policy survey_assignments_admin_all on public.survey_assignments
  for all
  using (exists (
    select 1 from public.surveys s
    where s.id = survey_assignments.survey_id
      and public.is_superadmin()
      and s.organization_id = public.current_user_org_id()
  ))
  with check (exists (
    select 1 from public.surveys s
    where s.id = survey_assignments.survey_id
      and public.is_superadmin()
      and s.organization_id = public.current_user_org_id()
  ));

drop policy if exists survey_assignments_staff_select on public.survey_assignments;
create policy survey_assignments_staff_select on public.survey_assignments
  for select
  using (staff_id = public.get_current_staff_id());

-- survey_responses / survey_answers: admins read (writes happen via submit_survey
-- RPC, which runs SECURITY DEFINER). No staff read policy — staff never read
-- responses, which keeps anonymous responses unreadable to anyone but aggregate
-- admin queries.
drop policy if exists survey_responses_admin_select on public.survey_responses;
create policy survey_responses_admin_select on public.survey_responses
  for select
  using (exists (
    select 1 from public.surveys s
    where s.id = survey_responses.survey_id
      and public.is_superadmin()
      and s.organization_id = public.current_user_org_id()
  ));

drop policy if exists survey_answers_admin_select on public.survey_answers;
create policy survey_answers_admin_select on public.survey_answers
  for select
  using (exists (
    select 1
    from public.survey_responses r
    join public.surveys s on s.id = r.survey_id
    where r.id = survey_answers.response_id
      and public.is_superadmin()
      and s.organization_id = public.current_user_org_id()
  ));

-- ─── publish_survey ──────────────────────────────────────────────────────────
-- Snapshots the recipient list into survey_assignments and opens the survey.
-- Recipients = non-paused staff in the survey's org matching the location/role
-- filters (empty filter array = no constraint on that dimension).
create or replace function public.publish_survey(p_survey_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org      uuid;
  v_loc      uuid[];
  v_role     int[];
  v_qcount   int;
begin
  if not public.is_superadmin() then
    raise exception 'Not authorized';
  end if;

  select organization_id, target_location_ids, target_role_ids
    into v_org, v_loc, v_role
  from public.surveys
  where id = p_survey_id
    and organization_id = public.current_user_org_id();

  if v_org is null then
    raise exception 'Survey not found or not in your organization';
  end if;

  select count(*) into v_qcount from public.survey_questions where survey_id = p_survey_id;
  if v_qcount = 0 then
    raise exception 'Add at least one question before publishing';
  end if;

  insert into public.survey_assignments (survey_id, staff_id)
  select p_survey_id, s.id
  from public.staff s
  join public.locations l       on l.id = s.primary_location_id
  join public.practice_groups pg on pg.id = l.group_id
  where pg.organization_id = v_org
    and coalesce(s.is_paused, false) = false
    and (cardinality(v_loc)  = 0 or s.primary_location_id = any(v_loc))
    and (cardinality(v_role) = 0 or s.role_id = any(v_role))
  on conflict (survey_id, staff_id) do nothing;

  update public.surveys
  set status       = 'open',
      published_at = coalesce(published_at, now())
  where id = p_survey_id;
end;
$$;

-- ─── submit_survey ───────────────────────────────────────────────────────────
-- Records a staff member's submission. Writes survey_responses with staff_id
-- only when the survey is attributed; marks the assignment completed either way.
-- p_answers: jsonb array of { "question_id": uuid, "value": <jsonb> }.
create or replace function public.submit_survey(p_survey_id uuid, p_answers jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_staff     uuid;
  v_anon      boolean;
  v_status    text;
  v_opens     timestamptz;
  v_closes    timestamptz;
  v_response  uuid;
  v_item      jsonb;
begin
  v_staff := public.get_current_staff_id();
  if v_staff is null then
    raise exception 'No staff profile for current user';
  end if;

  -- Must have been assigned this survey.
  if not exists (
    select 1 from public.survey_assignments
    where survey_id = p_survey_id and staff_id = v_staff
  ) then
    raise exception 'You were not assigned this survey';
  end if;

  -- Already done? Idempotent guard.
  if exists (
    select 1 from public.survey_assignments
    where survey_id = p_survey_id and staff_id = v_staff and status = 'completed'
  ) then
    raise exception 'You have already completed this survey';
  end if;

  select is_anonymous, status, opens_at, closes_at
    into v_anon, v_status, v_opens, v_closes
  from public.surveys
  where id = p_survey_id;

  if v_status <> 'open'
     or (v_opens  is not null and v_opens  > now())
     or (v_closes is not null and v_closes < now()) then
    raise exception 'This survey is not currently open';
  end if;

  insert into public.survey_responses (survey_id, staff_id)
  values (p_survey_id, case when v_anon then null else v_staff end)
  returning id into v_response;

  for v_item in select * from jsonb_array_elements(p_answers)
  loop
    insert into public.survey_answers (response_id, question_id, value)
    values (v_response, (v_item->>'question_id')::uuid, v_item->'value');
  end loop;

  update public.survey_assignments
  set status = 'completed', completed_at = now()
  where survey_id = p_survey_id and staff_id = v_staff;

  return v_response;
end;
$$;

grant execute on function public.publish_survey(uuid)        to authenticated;
grant execute on function public.submit_survey(uuid, jsonb)  to authenticated;
