-- Add confidence_late and performance_late to get_staff_week_assignments RPC output

CREATE OR REPLACE FUNCTION public.get_staff_week_assignments(
  p_staff_id uuid, 
  p_role_id bigint, 
  p_week_start date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cycle int;
  v_week_in_cycle int;
  v_phase text;
  v_cycle_length int;
  v_program_start date;
  v_location_id uuid;
  v_org_id uuid;
  v_tz text;
  v_assignments jsonb;
  v_required_count int := 0;
  v_conf_count int := 0;
  v_perf_count int := 0;
  v_last_activity_kind text;
  v_last_activity_at timestamptz;
  v_backlog_count int := 0;
BEGIN
  -- Get location config
  SELECT 
    l.cycle_length_weeks, 
    l.program_start_date::date, 
    l.timezone,
    s.primary_location_id,
    l.organization_id
  INTO v_cycle_length, v_program_start, v_tz, v_location_id, v_org_id
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

  -- Query weekly_assignments with priority:
  -- 1. Location-specific assignments
  -- 2. Org-level assignments
  -- 3. Global assignments
  
  -- Try location-specific first
  SELECT COUNT(*) INTO v_required_count
  FROM weekly_assignments wa
  WHERE wa.role_id = p_role_id
    AND wa.week_start_date = p_week_start
    AND wa.status = 'locked'
    AND wa.location_id = v_location_id;

  IF v_required_count > 0 THEN
    -- Use location-specific assignments
    SELECT jsonb_agg(
      jsonb_build_object(
        'focus_id', ('assign:' || wa.id)::text,
        'action_statement', COALESCE(pm.action_statement, 'Self-Select'),
        'domain_name', COALESCE(d.domain_name, 'General'),
        'required', NOT wa.self_select,
        'source', 'assignments',
        'confidence_score', ws.confidence_score,
        'confidence_date', ws.confidence_date,
        'confidence_late', ws.confidence_late,
        'performance_score', ws.performance_score,
        'performance_date', ws.performance_date,
        'performance_late', ws.performance_late,
        'display_order', wa.display_order,
        'self_select', wa.self_select,
        'competency_id', COALESCE(pm.competency_id, wa.competency_id),
        'action_id', wa.action_id
      ) ORDER BY wa.display_order
    ) INTO v_assignments
    FROM weekly_assignments wa
    LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
    LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, wa.competency_id)
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    LEFT JOIN weekly_scores ws ON 
      ws.staff_id = p_staff_id
      AND ws.assignment_id = ('assign:' || wa.id)::text
    WHERE wa.role_id = p_role_id
      AND wa.week_start_date = p_week_start
      AND wa.status = 'locked'
      AND wa.location_id = v_location_id;
  ELSE
    -- Try org-level
    SELECT COUNT(*) INTO v_required_count
    FROM weekly_assignments wa
    WHERE wa.role_id = p_role_id
      AND wa.week_start_date = p_week_start
      AND wa.status = 'locked'
      AND wa.org_id = v_org_id
      AND wa.location_id IS NULL;

    IF v_required_count > 0 THEN
      -- Use org-level assignments
      SELECT jsonb_agg(
        jsonb_build_object(
          'focus_id', ('assign:' || wa.id)::text,
          'action_statement', COALESCE(pm.action_statement, 'Self-Select'),
          'domain_name', COALESCE(d.domain_name, 'General'),
          'required', NOT wa.self_select,
          'source', 'assignments',
          'confidence_score', ws.confidence_score,
          'confidence_date', ws.confidence_date,
          'confidence_late', ws.confidence_late,
          'performance_score', ws.performance_score,
          'performance_date', ws.performance_date,
          'performance_late', ws.performance_late,
          'display_order', wa.display_order,
          'self_select', wa.self_select,
          'competency_id', COALESCE(pm.competency_id, wa.competency_id),
          'action_id', wa.action_id
        ) ORDER BY wa.display_order
      ) INTO v_assignments
      FROM weekly_assignments wa
      LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
      LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, wa.competency_id)
      LEFT JOIN domains d ON d.domain_id = c.domain_id
      LEFT JOIN weekly_scores ws ON 
        ws.staff_id = p_staff_id
        AND ws.assignment_id = ('assign:' || wa.id)::text
      WHERE wa.role_id = p_role_id
        AND wa.week_start_date = p_week_start
        AND wa.status = 'locked'
        AND wa.org_id = v_org_id
        AND wa.location_id IS NULL;
    ELSE
      -- Try global assignments
      SELECT COUNT(*) INTO v_required_count
      FROM weekly_assignments wa
      WHERE wa.role_id = p_role_id
        AND wa.week_start_date = p_week_start
        AND wa.status = 'locked'
        AND wa.source = 'global'
        AND wa.org_id IS NULL
        AND wa.location_id IS NULL;

      IF v_required_count > 0 THEN
        -- Use global assignments
        SELECT jsonb_agg(
          jsonb_build_object(
            'focus_id', ('assign:' || wa.id)::text,
            'action_statement', COALESCE(pm.action_statement, 'Self-Select'),
            'domain_name', COALESCE(d.domain_name, 'General'),
            'required', NOT wa.self_select,
            'source', 'assignments',
            'confidence_score', ws.confidence_score,
            'confidence_date', ws.confidence_date,
            'confidence_late', ws.confidence_late,
            'performance_score', ws.performance_score,
            'performance_date', ws.performance_date,
            'performance_late', ws.performance_late,
            'display_order', wa.display_order,
            'self_select', wa.self_select,
            'competency_id', COALESCE(pm.competency_id, wa.competency_id),
            'action_id', wa.action_id
          ) ORDER BY wa.display_order
        ) INTO v_assignments
        FROM weekly_assignments wa
        LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
        LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, wa.competency_id)
        LEFT JOIN domains d ON d.domain_id = c.domain_id
        LEFT JOIN weekly_scores ws ON 
          ws.staff_id = p_staff_id
          AND ws.assignment_id = ('assign:' || wa.id)::text
        WHERE wa.role_id = p_role_id
          AND wa.week_start_date = p_week_start
          AND wa.status = 'locked'
          AND wa.source = 'global'
          AND wa.org_id IS NULL
          AND wa.location_id IS NULL;
      ELSE
        -- No assignments found
        v_assignments := '[]'::jsonb;
      END IF;
    END IF;
  END IF;

  -- Count progress submissions
  IF v_assignments IS NOT NULL THEN
    SELECT COUNT(*) INTO v_conf_count
    FROM jsonb_array_elements(v_assignments) elem
    WHERE (elem->>'confidence_score') IS NOT NULL;

    SELECT COUNT(*) INTO v_perf_count
    FROM jsonb_array_elements(v_assignments) elem
    WHERE (elem->>'performance_score') IS NOT NULL;
  END IF;

  -- Get last activity
  SELECT 
    CASE 
      WHEN confidence_date > performance_date OR performance_date IS NULL THEN 'confidence'
      ELSE 'performance'
    END,
    GREATEST(confidence_date, performance_date)
  INTO v_last_activity_kind, v_last_activity_at
  FROM weekly_scores
  WHERE staff_id = p_staff_id
    AND assignment_id LIKE 'assign:%'
    AND (confidence_date IS NOT NULL OR performance_date IS NOT NULL)
  ORDER BY GREATEST(confidence_date, performance_date) DESC NULLS LAST
  LIMIT 1;

  -- Count backlog
  SELECT COUNT(*) INTO v_backlog_count
  FROM user_backlog_v2
  WHERE staff_id = p_staff_id
    AND resolved_on IS NULL;

  -- Build final response
  RETURN jsonb_build_object(
    'assignments', COALESCE(v_assignments, '[]'::jsonb),
    'status', jsonb_build_object(
      'required_count', v_required_count,
      'confidence_count', v_conf_count,
      'performance_count', v_perf_count,
      'last_activity', jsonb_build_object(
        'kind', v_last_activity_kind,
        'at', v_last_activity_at
      )
    ),
    'week_context', jsonb_build_object(
      'cycle', v_cycle,
      'week_in_cycle', v_week_in_cycle,
      'phase', v_phase,
      'backlog_count', v_backlog_count
    )
  );
END;
$function$;