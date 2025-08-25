-- Create RPC to get last progress week for a staff member
CREATE OR REPLACE FUNCTION public.get_last_progress_week(p_staff_id uuid)
RETURNS TABLE(last_cycle int, last_week int, is_complete boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
WITH scored as (
  SELECT ws.weekly_focus_id
  FROM weekly_scores ws
  WHERE ws.staff_id = p_staff_id
),
last_wf as (
  SELECT wf.cycle, wf.week_in_cycle
  FROM weekly_focus wf
  JOIN scored s ON s.weekly_focus_id = wf.id
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
$$;

-- Update get_focus_cycle_week to ensure domain_name is included
CREATE OR REPLACE FUNCTION public.get_focus_cycle_week(p_cycle integer, p_week integer, p_role_id bigint)
RETURNS TABLE(id uuid, display_order integer, action_statement text, domain_name text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    wf.id,
    wf.display_order,
    COALESCE(pm.action_statement, 'Self-Select') as action_statement,
    COALESCE(d.domain_name, 'General') as domain_name
  FROM weekly_focus wf
  LEFT JOIN pro_moves pm ON pm.action_id = wf.action_id
  LEFT JOIN competencies c ON c.competency_id = COALESCE(wf.competency_id, pm.competency_id)
  LEFT JOIN domains d ON d.domain_id = c.domain_id
  WHERE wf.cycle = p_cycle
    AND wf.week_in_cycle = p_week
    AND wf.role_id = p_role_id
  ORDER BY wf.display_order;
$$;