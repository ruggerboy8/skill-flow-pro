-- Create function to get weekly focus data with domain information for WeekInfo
CREATE OR REPLACE FUNCTION public.get_weekly_focus_with_domains(
  p_cycle INTEGER,
  p_week INTEGER,
  p_role_id BIGINT
)
RETURNS TABLE(
  id UUID,
  display_order INTEGER,
  action_statement TEXT,
  domain_name TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    wf.id,
    wf.display_order,
    pm.action_statement,
    d.domain_name
  FROM weekly_focus wf
  JOIN pro_moves pm ON pm.action_id = wf.action_id
  JOIN competencies c ON c.competency_id = pm.competency_id
  JOIN domains d ON d.domain_id = c.domain_id
  WHERE wf.cycle = p_cycle
    AND wf.week_in_cycle = p_week
    AND wf.role_id = p_role_id
  ORDER BY wf.display_order;
$$;