-- Ask Alcan — follow-up hardening from code review.
-- Idempotent: safe to re-run.
--
-- 1. Anonymity: coarsen anonymous response timestamps to the day so an admin
--    can't correlate survey_responses.submitted_at with the precise
--    survey_assignments.completed_at to re-identify "anonymous" answers.
-- 2. submit_survey: reject answers whose question_id doesn't belong to the survey.
-- 3. survey_questions: enforce at the DB level that questions can only be
--    written while the parent survey is still a draft (UI already locks this).
-- 4. publish_survey: only assign staff at ACTIVE locations, matching the
--    locations offered in the targeting picker and the recipient estimate.
--
-- NOTE: the survey RLS security boundary is org-scoping
-- (is_superadmin() AND organization_id = current_user_org_id()), NOT an
-- "Alcan-only" gate — the Alcan restriction lives in the frontend. If a second
-- org ever uses surveys, the data scoping already isolates them correctly.

-- ─── submit_survey (anonymity coarsening + question validation) ───────────────
create or replace function public.submit_survey(p_survey_id uuid, p_answers jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_staff    uuid;
  v_anon     boolean;
  v_status   text;
  v_opens    timestamptz;
  v_closes   timestamptz;
  v_response uuid;
  v_item     jsonb;
begin
  v_staff := public.get_current_staff_id();
  if v_staff is null then
    raise exception 'No staff profile for current user';
  end if;

  if not exists (
    select 1 from public.survey_assignments
    where survey_id = p_survey_id and staff_id = v_staff
  ) then
    raise exception 'You were not assigned this survey';
  end if;

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

  -- Every answered question must belong to this survey.
  if exists (
    select 1 from jsonb_array_elements(p_answers) it
    where not exists (
      select 1 from public.survey_questions q
      where q.id = (it->>'question_id')::uuid and q.survey_id = p_survey_id
    )
  ) then
    raise exception 'Submission references a question that is not part of this survey';
  end if;

  -- Anonymous responses store no staff_id and only a day-grain timestamp, so
  -- they can't be lined up against the precise assignment completion time.
  insert into public.survey_responses (survey_id, staff_id, submitted_at)
  values (
    p_survey_id,
    case when v_anon then null else v_staff end,
    case when v_anon then date_trunc('day', now()) else now() end
  )
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

-- ─── publish_survey (active-location filter) ──────────────────────────────────
create or replace function public.publish_survey(p_survey_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_org    uuid;
  v_loc    uuid[];
  v_role   int[];
  v_qcount int;
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
  join public.locations l        on l.id = s.primary_location_id
  join public.practice_groups pg on pg.id = l.group_id
  where pg.organization_id = v_org
    and coalesce(s.is_paused, false) = false
    and coalesce(l.active, true) = true
    and (cardinality(v_loc)  = 0 or s.primary_location_id = any(v_loc))
    and (cardinality(v_role) = 0 or s.role_id = any(v_role))
  on conflict (survey_id, staff_id) do nothing;

  update public.surveys
  set status = 'open', published_at = coalesce(published_at, now())
  where id = p_survey_id;
end;
$$;

-- ─── survey_questions: writes only while the survey is a draft ────────────────
drop policy if exists survey_questions_admin_all on public.survey_questions;
drop policy if exists survey_questions_admin_select on public.survey_questions;
drop policy if exists survey_questions_admin_insert on public.survey_questions;
drop policy if exists survey_questions_admin_update on public.survey_questions;
drop policy if exists survey_questions_admin_delete on public.survey_questions;

create policy survey_questions_admin_select on public.survey_questions
  for select
  using (exists (
    select 1 from public.surveys s
    where s.id = survey_questions.survey_id
      and public.is_superadmin()
      and s.organization_id = public.current_user_org_id()
  ));

create policy survey_questions_admin_insert on public.survey_questions
  for insert
  with check (exists (
    select 1 from public.surveys s
    where s.id = survey_questions.survey_id
      and public.is_superadmin()
      and s.organization_id = public.current_user_org_id()
      and s.status = 'draft'
  ));

create policy survey_questions_admin_update on public.survey_questions
  for update
  using (exists (
    select 1 from public.surveys s
    where s.id = survey_questions.survey_id
      and public.is_superadmin()
      and s.organization_id = public.current_user_org_id()
      and s.status = 'draft'
  ))
  with check (exists (
    select 1 from public.surveys s
    where s.id = survey_questions.survey_id
      and public.is_superadmin()
      and s.organization_id = public.current_user_org_id()
      and s.status = 'draft'
  ));

create policy survey_questions_admin_delete on public.survey_questions
  for delete
  using (exists (
    select 1 from public.surveys s
    where s.id = survey_questions.survey_id
      and public.is_superadmin()
      and s.organization_id = public.current_user_org_id()
      and s.status = 'draft'
  ));
