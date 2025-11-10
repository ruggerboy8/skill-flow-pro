
-- Fix type casting in remaining stats RPC functions

-- Fix get_cycle_week_status
CREATE OR REPLACE FUNCTION public.get_cycle_week_status(p_staff_id uuid, p_role_id bigint)
RETURNS TABLE(cycle integer, week_in_cycle integer, total integer, conf_count integer, perf_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    wf.cycle,
    wf.week_in_cycle,
    COUNT(*)::integer as total,
    COUNT(ws.confidence_score)::integer as conf_count,
    COUNT(ws.performance_score)::integer as perf_count
  FROM weekly_focus wf
  LEFT JOIN weekly_scores ws ON ws.weekly_focus_id = wf.id::text AND ws.staff_id = p_staff_id
  WHERE wf.role_id = p_role_id
  GROUP BY wf.cycle, wf.week_in_cycle
  ORDER BY wf.cycle, wf.week_in_cycle;
END;
$function$;

-- Fix get_weekly_review
CREATE OR REPLACE FUNCTION public.get_weekly_review(
  p_cycle INTEGER,
  p_week INTEGER,
  p_role_id BIGINT,
  p_staff_id UUID
)
RETURNS TABLE(
  domain_name TEXT,
  action_statement TEXT,
  confidence_score INTEGER,
  performance_score INTEGER
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    d.domain_name,
    pm.action_statement,
    ws.confidence_score,
    ws.performance_score
  FROM weekly_focus wf
  JOIN pro_moves pm ON pm.action_id = wf.action_id
  JOIN competencies c ON c.competency_id = pm.competency_id
  JOIN domains d ON d.domain_id = c.domain_id
  JOIN weekly_scores ws ON ws.weekly_focus_id = wf.id::text
  WHERE wf.cycle = p_cycle
    AND wf.week_in_cycle = p_week
    AND wf.role_id = p_role_id
    AND ws.staff_id = p_staff_id
  ORDER BY wf.display_order;
$$;

-- Fix get_last_progress_week
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
    AND ws.confidence_score IS NOT NULL
    AND ws.performance_score IS NOT NULL
),
latest as (
  SELECT 
    wf.cycle, 
    wf.week_in_cycle,
    COUNT(*) as total,
    COUNT(s.weekly_focus_id) as scored
  FROM weekly_focus wf
  CROSS JOIN staff_info si
  LEFT JOIN scored s ON s.weekly_focus_id = wf.id::text
  WHERE wf.role_id = si.role_id
  GROUP BY wf.cycle, wf.week_in_cycle
  ORDER BY wf.cycle DESC, wf.week_in_cycle DESC
  LIMIT 1
)
SELECT 
  cycle as last_cycle, 
  week_in_cycle as last_week, 
  (scored = total) as is_complete
FROM latest;
$function$;
