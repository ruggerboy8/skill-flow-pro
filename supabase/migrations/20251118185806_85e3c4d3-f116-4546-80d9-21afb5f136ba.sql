-- Create unified week assignments RPC for coaches viewing staff detail
-- Returns all assignments (weekly_focus OR weekly_plan) + scores for a given staff/week

CREATE OR REPLACE FUNCTION public.get_staff_week_assignments(
  p_staff_id uuid,
  p_role_id bigint,
  p_week_start date
)
RETURNS TABLE(
  focus_id text,
  action_statement text,
  domain_name text,
  required boolean,
  source text,
  confidence_score integer,
  confidence_date timestamptz,
  performance_score integer,
  performance_date timestamptz,
  display_order integer,
  self_select boolean,
  competency_id bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cycle int;
  v_week_in_cycle int;
  v_phase text;
  v_cycle_length int;
  v_program_start date;
  v_tz text;
BEGIN
  -- Get location config
  SELECT l.cycle_length_weeks, l.program_start_date::date, l.timezone
    INTO v_cycle_length, v_program_start, v_tz
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = p_staff_id;

  IF v_cycle_length IS NULL THEN
    RAISE EXCEPTION 'No location config for staff %', p_staff_id;
  END IF;

  -- Compute cycle/week from week_start
  v_cycle := CASE 
    WHEN ((p_week_start - v_program_start) / 7) = 0 THEN 1
    ELSE (((p_week_start - v_program_start) / 7) / v_cycle_length) + 1
  END;
  
  v_week_in_cycle := CASE
    WHEN ((p_week_start - v_program_start) / 7) = 0 THEN 1
    ELSE (((p_week_start - v_program_start) / 7) % v_cycle_length) + 1
  END;

  v_phase := CASE WHEN v_cycle <= 3 THEN 'focus' ELSE 'plan' END;

  -- Return assignments based on phase
  IF v_phase = 'focus' THEN
    -- weekly_focus source
    RETURN QUERY
    SELECT
      wf.id::text AS focus_id,
      COALESCE(pm.action_statement, 'Self-Select') AS action_statement,
      COALESCE(d.domain_name, 'General') AS domain_name,
      NOT wf.self_select AS required,
      'focus'::text AS source,
      ws.confidence_score,
      ws.confidence_date,
      ws.performance_score,
      ws.performance_date,
      wf.display_order,
      wf.self_select,
      COALESCE(pm.competency_id, wf.competency_id) AS competency_id
    FROM weekly_focus wf
    LEFT JOIN pro_moves pm ON pm.action_id = wf.action_id
    LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, wf.competency_id)
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    LEFT JOIN weekly_scores ws ON ws.weekly_focus_id = wf.id::text AND ws.staff_id = p_staff_id
    WHERE wf.role_id = p_role_id
      AND wf.cycle = v_cycle
      AND wf.week_in_cycle = v_week_in_cycle
    ORDER BY wf.display_order;
  ELSE
    -- weekly_plan source (cycle 4+)
    RETURN QUERY
    SELECT
      ('plan:' || wp.id)::text AS focus_id,
      COALESCE(pm.action_statement, 'Self-Select') AS action_statement,
      COALESCE(d.domain_name, 'General') AS domain_name,
      NOT wp.self_select AS required,
      'plan'::text AS source,
      ws.confidence_score,
      ws.confidence_date,
      ws.performance_score,
      ws.performance_date,
      wp.display_order,
      wp.self_select,
      COALESCE(pm.competency_id, wp.competency_id) AS competency_id
    FROM weekly_plan wp
    LEFT JOIN pro_moves pm ON pm.action_id = wp.action_id
    LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, wp.competency_id)
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    LEFT JOIN weekly_scores ws ON ws.weekly_focus_id = ('plan:' || wp.id)::text AND ws.staff_id = p_staff_id
    WHERE wp.role_id = p_role_id
      AND wp.week_start_date = p_week_start
      AND wp.status = 'locked'
    ORDER BY wp.display_order;
  END IF;
END;
$$;