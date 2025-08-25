-- Create RPC for getting cycle week status efficiently
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
  LEFT JOIN weekly_scores ws ON ws.weekly_focus_id = wf.id AND ws.staff_id = p_staff_id
  WHERE wf.role_id = p_role_id
  GROUP BY wf.cycle, wf.week_in_cycle
  ORDER BY wf.cycle, wf.week_in_cycle;
END;
$function$;

-- Create RPC for safely deleting week data in a transaction
CREATE OR REPLACE FUNCTION public.delete_week_data(p_staff_id uuid, p_role_id bigint, p_cycle integer, p_week integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  focus_ids uuid[];
  deleted_scores_count integer := 0;
  deleted_selections_count integer := 0;
  user_record uuid;
BEGIN
  -- Check if user is super admin
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Super admin required.';
  END IF;

  -- Get user_id from staff record
  SELECT user_id INTO user_record
  FROM staff 
  WHERE id = p_staff_id;
  
  IF user_record IS NULL THEN
    RAISE EXCEPTION 'Staff record not found.';
  END IF;

  -- Get weekly focus IDs for this specific week/cycle/role
  SELECT array_agg(id) INTO focus_ids
  FROM weekly_focus
  WHERE cycle = p_cycle 
    AND week_in_cycle = p_week 
    AND role_id = p_role_id;

  IF focus_ids IS NULL OR array_length(focus_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No focus data found for Cycle %, Week % for this role.', p_cycle, p_week;
  END IF;

  -- Delete weekly scores for this staff and these focus IDs
  DELETE FROM weekly_scores 
  WHERE staff_id = p_staff_id 
    AND weekly_focus_id = ANY(focus_ids);
  
  GET DIAGNOSTICS deleted_scores_count = ROW_COUNT;

  -- Delete weekly self-selections for this user and these focus IDs
  DELETE FROM weekly_self_select
  WHERE user_id = user_record
    AND weekly_focus_id = ANY(focus_ids);
    
  GET DIAGNOSTICS deleted_selections_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Deleted data for Cycle %s, Week %s', p_cycle, p_week),
    'deleted_scores', deleted_scores_count,
    'deleted_selections', deleted_selections_count
  );
END;
$function$;

-- Create RPC for getting evaluations summary
CREATE OR REPLACE FUNCTION public.get_evaluations_summary(p_staff_id uuid)
RETURNS TABLE(
  eval_id uuid,
  submitted_at timestamp with time zone,
  status text,
  type text,
  quarter text,
  program_year integer,
  domain_name text,
  avg_self numeric,
  avg_observer numeric,
  delta numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as eval_id,
    e.updated_at as submitted_at,
    e.status,
    e.type,
    e.quarter,
    e.program_year,
    ei.domain_name,
    ROUND(AVG(ei.self_score)::numeric, 1) as avg_self,
    ROUND(AVG(ei.observer_score)::numeric, 1) as avg_observer,
    ROUND((AVG(ei.observer_score) - AVG(ei.self_score))::numeric, 1) as delta
  FROM evaluations e
  JOIN evaluation_items ei ON ei.evaluation_id = e.id
  WHERE e.staff_id = p_staff_id
    AND ei.domain_name IS NOT NULL
    AND (ei.self_score IS NOT NULL OR ei.observer_score IS NOT NULL)
  GROUP BY e.id, e.updated_at, e.status, e.type, e.quarter, e.program_year, ei.domain_name
  ORDER BY e.updated_at DESC, ei.domain_name;
END;
$function$;