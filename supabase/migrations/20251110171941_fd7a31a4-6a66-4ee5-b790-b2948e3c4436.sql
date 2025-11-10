-- Phase 1: Backend - Calendar View Migration
-- Create RPCs for calendar-based week status and detail views

-- 1. Create get_calendar_week_status RPC
create or replace function get_calendar_week_status(
  p_staff_id uuid,
  p_role_id int
) returns table (
  week_of date,
  total int,
  conf_count int,
  perf_count int,
  cycle int,
  week_in_cycle int,
  source text
) language sql stable security definer as $$
with sr as (
  select 
    s.id as staff_id, 
    s.role_id, 
    s.primary_location_id,
    l.program_start_date,
    l.cycle_length_weeks,
    l.timezone
  from staff s
  join locations l on l.id = s.primary_location_id
  where s.id = p_staff_id
    and s.primary_location_id is not null
    and l.program_start_date is not null
),
-- Normalize program_start_date to Monday of that week
anch as (
  select 
    sr.*,
    (date_trunc('week', (sr.program_start_date::timestamptz at time zone sr.timezone))::date) as anchor_monday
  from sr
),
-- Map cycles 1–3 to calendar weeks using the anchor
onboarding as (
  select
    (anch.anchor_monday
      + ((wf.cycle - 1) * anch.cycle_length_weeks + (wf.week_in_cycle - 1)) * interval '7 day')::date as week_of,
    wf.cycle, 
    wf.week_in_cycle,
    count(*)::int as total,
    count(ws.confidence_score) filter (where ws.confidence_score is not null)::int as conf_count,
    count(ws.performance_score) filter (where ws.performance_score is not null)::int as perf_count
  from weekly_focus wf
  join anch on anch.role_id = wf.role_id
  left join weekly_scores ws
    on ws.weekly_focus_id = wf.id::text and ws.staff_id = anch.staff_id
  where wf.cycle between 1 and 3
  group by 1, 2, 3
),
-- For cycle ≥ 4, bucket by score timestamps
ongoing as (
  select
    date_trunc('week', 
      coalesce(ws.performance_date, ws.confidence_date, ws.created_at) 
      at time zone anch.timezone
    )::date as week_of,
    null::int as cycle, 
    null::int as week_in_cycle,
    count(*)::int as total,
    count(ws.confidence_score) filter (where ws.confidence_score is not null)::int as conf_count,
    count(ws.performance_score) filter (where ws.performance_score is not null)::int as perf_count
  from weekly_scores ws
  join weekly_focus wf on wf.id::text = ws.weekly_focus_id
  join anch on anch.staff_id = ws.staff_id and anch.role_id = wf.role_id
  where wf.cycle >= 4
  group by 1
)
select week_of, total, conf_count, perf_count, cycle, week_in_cycle, 'onboarding'::text as source 
from onboarding
union all
select week_of, total, conf_count, perf_count, cycle, week_in_cycle, 'ongoing'::text as source 
from ongoing
order by week_of desc;
$$;

-- 2. Create get_week_detail_by_week RPC
create or replace function get_week_detail_by_week(
  p_staff_id uuid,
  p_role_id int,
  p_week_of date
) returns table (
  domain_name text,
  action_statement text,
  confidence_score int,
  performance_score int
) language sql stable security definer as $$
with sr as (
  select 
    s.id as staff_id, 
    s.user_id,
    s.role_id,
    l.timezone
  from staff s
  join locations l on l.id = s.primary_location_id
  where s.id = p_staff_id
)
select 
  coalesce(d.domain_name, 'General') as domain_name,
  coalesce(
    pm_selected.action_statement,
    pm.action_statement,
    'Pro Move'
  ) as action_statement,
  ws.confidence_score,
  ws.performance_score
from weekly_scores ws
join weekly_focus wf on wf.id::text = ws.weekly_focus_id
join sr on sr.staff_id = ws.staff_id and sr.role_id = wf.role_id
left join pro_moves pm on pm.action_id = wf.action_id
left join weekly_self_select wss on wss.weekly_focus_id = wf.id and wss.user_id = sr.user_id
left join pro_moves pm_selected on pm_selected.action_id = wss.selected_pro_move_id
left join competencies c on c.competency_id = coalesce(pm_selected.competency_id, pm.competency_id, wf.competency_id)
left join domains d on d.domain_id = c.domain_id
where wf.cycle >= 4
  and date_trunc('week', 
    coalesce(ws.performance_date, ws.confidence_date, ws.created_at) 
    at time zone sr.timezone
  )::date = p_week_of
order by ws.created_at;
$$;

-- 3. Create delete_week_data_by_week RPC
create or replace function delete_week_data_by_week(
  p_staff_id uuid,
  p_role_id bigint,
  p_week_of date
) returns jsonb language plpgsql security definer as $$
declare
  v_tz text;
  v_deleted_scores int := 0;
  v_deleted_selections int := 0;
  v_user_id uuid;
begin
  -- Check super admin
  if not is_super_admin(auth.uid()) then
    raise exception 'Access denied. Super admin required.';
  end if;

  -- Get timezone and user_id
  select l.timezone, s.user_id
  into v_tz, v_user_id
  from staff s
  join locations l on l.id = s.primary_location_id
  where s.id = p_staff_id;

  if v_tz is null then
    raise exception 'No location/timezone found for staff';
  end if;

  -- Delete weekly_scores for ongoing weeks matching the calendar week
  delete from weekly_scores ws
  using weekly_focus wf, staff s, locations l
  where ws.weekly_focus_id = wf.id::text
    and ws.staff_id = p_staff_id
    and s.id = p_staff_id
    and l.id = s.primary_location_id
    and wf.role_id = p_role_id
    and wf.cycle >= 4
    and date_trunc('week', 
      coalesce(ws.performance_date, ws.confidence_date, ws.created_at) 
      at time zone v_tz
    )::date = p_week_of;
  
  get diagnostics v_deleted_scores = row_count;

  -- Delete weekly_self_select for this week
  delete from weekly_self_select wss
  using weekly_focus wf, weekly_scores ws, staff s, locations l
  where wss.weekly_focus_id = wf.id
    and wss.user_id = v_user_id
    and ws.weekly_focus_id = wf.id::text
    and ws.staff_id = p_staff_id
    and s.id = p_staff_id
    and l.id = s.primary_location_id
    and wf.role_id = p_role_id
    and wf.cycle >= 4
    and date_trunc('week', 
      coalesce(ws.performance_date, ws.confidence_date, ws.created_at) 
      at time zone l.timezone
    )::date = p_week_of;
  
  get diagnostics v_deleted_selections = row_count;

  return jsonb_build_object(
    'success', true,
    'message', format('Deleted data for week of %s', p_week_of),
    'deleted_scores', v_deleted_scores,
    'deleted_selections', v_deleted_selections
  );
end;
$$;

-- 4. Add Performance Indexes
create index if not exists idx_weekly_scores_staff_dates
  on weekly_scores (staff_id, performance_date, confidence_date);

create index if not exists idx_weekly_focus_role_cycle
  on weekly_focus (role_id, cycle, week_in_cycle);