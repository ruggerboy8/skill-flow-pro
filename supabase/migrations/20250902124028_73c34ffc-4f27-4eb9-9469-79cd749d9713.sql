-- Fix get_last_progress_week to filter by staff member's role
CREATE OR REPLACE FUNCTION public.get_last_progress_week(p_staff_id uuid)
 RETURNS TABLE(last_cycle integer, last_week integer, is_complete boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
WITH staff_info as (
  SELECT role_id FROM staff WHERE id = p_staff_id
),
scored as (
  SELECT ws.weekly_focus_id
  FROM weekly_scores ws
  WHERE ws.staff_id = p_staff_id
),
last_wf as (
  SELECT wf.cycle, wf.week_in_cycle
  FROM weekly_focus wf
  JOIN scored s ON s.weekly_focus_id = wf.id
  JOIN staff_info si ON wf.role_id = si.role_id
  ORDER BY wf.cycle DESC, wf.week_in_cycle DESC
  LIMIT 1
),
picked as (
  SELECT COALESCE(l.cycle,1) as cycle,
         COALESCE(l.week_in_cycle,1) as week
  FROM (SELECT NULL::int as cycle, NULL::int as week_in_cycle) dummy
  LEFT JOIN last_wf l ON true
),
assignments as (
  SELECT wf.id
  FROM weekly_focus wf
  JOIN picked p ON p.cycle = wf.cycle AND p.week = wf.week_in_cycle
  JOIN staff_info si ON wf.role_id = si.role_id
),
counts as (
  SELECT
    (SELECT count(*) FROM assignments) as total_slots,
    (SELECT count(*) FROM weekly_scores ws
     JOIN assignments a ON a.id = ws.weekly_focus_id
     WHERE ws.staff_id = p_staff_id AND ws.confidence_score IS NOT NULL) as conf_filled,
    (SELECT count(*) FROM weekly_scores ws
     JOIN assignments a ON a.id = ws.weekly_focus_id
     WHERE ws.staff_id = p_staff_id AND ws.performance_score IS NOT NULL) as perf_filled
)
SELECT
  (SELECT cycle FROM picked) as last_cycle,
  (SELECT week FROM picked) as last_week,
  (SELECT (conf_filled >= total_slots AND perf_filled >= total_slots) FROM counts) as is_complete;
$function$