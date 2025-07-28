-- Fix search path security issue for the function
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
  JOIN weekly_scores ws ON ws.weekly_focus_id = wf.id
  WHERE wf.cycle = p_cycle
    AND wf.week_in_cycle = p_week
    AND wf.role_id = p_role_id
    AND ws.staff_id = p_staff_id
  ORDER BY wf.display_order;
$$;