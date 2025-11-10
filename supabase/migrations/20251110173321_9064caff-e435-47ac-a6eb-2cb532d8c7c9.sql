-- Fix get_calendar_week_status - replace the entire function
DROP FUNCTION IF EXISTS public.get_calendar_week_status(uuid, integer);

CREATE FUNCTION public.get_calendar_week_status(p_staff_id uuid, p_role_id integer)
 RETURNS TABLE(week_of date, total integer, conf_count integer, perf_count integer, cycle integer, week_in_cycle integer, source text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
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
anch as (
  select 
    sr.*,
    (date_trunc('week', (sr.program_start_date::timestamptz at time zone sr.timezone))::date) as anchor_monday
  from sr
),
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
ongoing as (
  select
    wp.week_start_date as week_of,
    null::int as cycle,
    null::int as week_in_cycle,
    count(*)::int as total,
    count(ws.confidence_score) filter (where ws.confidence_score is not null)::int as conf_count,
    count(ws.performance_score) filter (where ws.performance_score is not null)::int as perf_count
  from weekly_plan wp
  join anch on anch.role_id = wp.role_id
  left join weekly_scores ws 
    on ws.weekly_focus_id = 'plan:' || wp.id::text 
    and ws.staff_id = anch.staff_id
  where wp.org_id is null
    and wp.status = 'locked'
  group by wp.week_start_date
)
select week_of, total, conf_count, perf_count, cycle, week_in_cycle, 'onboarding'::text as source 
from onboarding
union all
select week_of, total, conf_count, perf_count, cycle, week_in_cycle, 'ongoing'::text as source 
from ongoing
order by week_of desc;
$function$;