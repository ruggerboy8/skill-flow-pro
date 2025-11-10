-- Drop old function and create new one with p_source parameter - fixed date arithmetic
DROP FUNCTION IF EXISTS public.get_week_detail_by_week(uuid, integer, date);

CREATE FUNCTION public.get_week_detail_by_week(
  p_staff_id uuid,
  p_role_id integer,
  p_week_of date,
  p_source text
)
RETURNS TABLE(
  domain_name text,
  action_statement text,
  confidence_score integer,
  performance_score integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
with sr as (
  select 
    s.id as staff_id,
    s.user_id,
    s.role_id,
    s.primary_location_id,
    l.program_start_date,
    l.cycle_length_weeks,
    l.timezone
  from staff s
  join locations l on l.id = s.primary_location_id
  where s.id = p_staff_id
),
anch as (
  select 
    sr.*,
    (date_trunc('week', (sr.program_start_date::timestamptz at time zone sr.timezone))::date) as anchor_monday
  from sr
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
from (
  select * from (
    -- Onboarding weeks: derive cycle/week from week_of, then query weekly_focus
    select 
      wf.id::text as focus_id,
      wf.action_id,
      wf.competency_id,
      wf.display_order,
      sr.staff_id,
      sr.user_id
    from weekly_focus wf
    cross join sr
    cross join anch
    where p_source = 'onboarding'
      and wf.role_id = sr.role_id
      and wf.cycle = ((p_week_of - anch.anchor_monday) / 7) / anch.cycle_length_weeks + 1
      and wf.week_in_cycle = ((p_week_of - anch.anchor_monday) / 7) % anch.cycle_length_weeks + 1
    
    union all
    
    -- Ongoing weeks: query weekly_plan
    select 
      'plan:' || wp.id::text as focus_id,
      wp.action_id,
      wp.competency_id,
      wp.display_order,
      sr.staff_id,
      sr.user_id
    from weekly_plan wp
    cross join sr
    where p_source = 'ongoing'
      and wp.role_id = sr.role_id
      and wp.org_id is null
      and wp.status = 'locked'
      and wp.week_start_date = p_week_of
  ) unified
) unified
left join weekly_scores ws 
  on ws.weekly_focus_id = unified.focus_id
  and ws.staff_id = unified.staff_id
left join pro_moves pm on pm.action_id = unified.action_id
left join weekly_self_select wss 
  on wss.weekly_focus_id = split_part(unified.focus_id, ':', 2)::uuid
  and wss.user_id = unified.user_id
left join pro_moves pm_selected on pm_selected.action_id = wss.selected_pro_move_id
left join competencies c on c.competency_id = coalesce(pm_selected.competency_id, pm.competency_id, unified.competency_id)
left join domains d on d.domain_id = c.domain_id
order by unified.display_order;
$function$;