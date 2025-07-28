-- Drop the old RPC function and create a new one using cycle/week_in_cycle
DROP FUNCTION IF EXISTS public.get_weekly_focus_with_domains(integer, integer, bigint);

-- Create the new cycle-based function
CREATE OR REPLACE FUNCTION public.get_focus_cycle_week(
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
    COALESCE(pm.action_statement, 'Self-Select') as action_statement,
    d.domain_name
  FROM weekly_focus wf
  LEFT JOIN pro_moves pm ON pm.action_id = wf.action_id
  LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, wf.competency_id)
  LEFT JOIN domains d ON d.domain_id = c.domain_id
  WHERE wf.cycle = p_cycle
    AND wf.week_in_cycle = p_week
    AND wf.role_id = p_role_id
  ORDER BY wf.display_order;
$$;