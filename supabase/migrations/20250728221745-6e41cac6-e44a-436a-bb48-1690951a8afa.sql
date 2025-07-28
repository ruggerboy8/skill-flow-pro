-- First let's check if the function exists by trying to recreate it
-- This function should return weekly focus data with domain information
CREATE OR REPLACE FUNCTION public.get_weekly_focus_with_domains(
  p_cycle integer, 
  p_week integer, 
  p_role_id bigint
)
RETURNS TABLE(
  id uuid,
  display_order integer,
  action_statement text,
  domain_name text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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