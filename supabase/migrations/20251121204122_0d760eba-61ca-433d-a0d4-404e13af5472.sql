-- Fix get_staff_week_assignments to use proper source priority instead of combining all sources
-- Priority: location-specific > org-level > global

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
  v_source_used text := null;
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

  -- Check for V2 assignments with proper priority:
  -- 1. Location-specific
  SELECT COUNT(*) INTO v_required_count
  FROM weekly_assignments wa
  WHERE wa.role_id = p_role_id
    AND wa.week_start_date = p_week_start
    AND wa.status = 'locked'
    AND wa.location_id = v_location_id;

  IF v_required_count > 0 THEN
    -- Use location-specific V2 assignments
    v_source_used := 'assignments';
    SELECT jsonb_agg(
      jsonb_build_object(
        'focus_id', ('assign:' || wa.id)::text,
        'action_statement', COALESCE(pm.action_statement, 'Self-Select'),
        'domain_name', COALESCE(d.domain_name, 'General'),
        'required', NOT wa.self_select,
        'source', 'assignments',
        'confidence_score', ws.confidence_score,
        'confidence_date', ws.confidence_date,
        'performance_score', ws.performance_score,
        'performance_date', ws.performance_date,
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
      AND ws.week_of = p_week_start
      AND ws.assignment_id = ('assign:' || wa.id)::text
    WHERE wa.role_id = p_role_id
      AND wa.week_start_date = p_week_start
      AND wa.status = 'locked'
      AND wa.location_id = v_location_id;
  ELSE
    -- 2. Check org-level
    SELECT COUNT(*) INTO v_required_count
    FROM weekly_assignments wa
    WHERE wa.role_id = p_role_id
      AND wa.week_start_date = p_week_start
      AND wa.status = 'locked'
      AND wa.org_id = v_org_id
      AND wa.location_id IS NULL;

    IF v_required_count > 0 THEN
      -- Use org-level V2 assignments
      v_source_used := 'assignments';
      SELECT jsonb_agg(
        jsonb_build_object(
          'focus_id', ('assign:' || wa.id)::text,
          'action_statement', COALESCE(pm.action_statement, 'Self-Select'),
          'domain_name', COALESCE(d.domain_name, 'General'),
          'required', NOT wa.self_select,
          'source', 'assignments',
          'confidence_score', ws.confidence_score,
          'confidence_date', ws.confidence_date,
          'performance_score', ws.performance_score,
          'performance_date', ws.performance_date,
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
        AND ws.week_of = p_week_start
        AND ws.assignment_id = ('assign:' || wa.id)::text
      WHERE wa.role_id = p_role_id
        AND wa.week_start_date = p_week_start
        AND wa.status = 'locked'
        AND wa.org_id = v_org_id
        AND wa.location_id IS NULL;
    ELSE
      -- 3. Check global
      SELECT COUNT(*) INTO v_required_count
      FROM weekly_assignments wa
      WHERE wa.role_id = p_role_id
        AND wa.week_start_date = p_week_start
        AND wa.status = 'locked'
        AND wa.org_id IS NULL
        AND wa.location_id IS NULL;

      IF v_required_count > 0 THEN
        -- Use global V2 assignments
        v_source_used := 'assignments';
        SELECT jsonb_agg(
          jsonb_build_object(
            'focus_id', ('assign:' || wa.id)::text,
            'action_statement', COALESCE(pm.action_statement, 'Self-Select'),
            'domain_name', COALESCE(d.domain_name, 'General'),
            'required', NOT wa.self_select,
            'source', 'assignments',
            'confidence_score', ws.confidence_score,
            'confidence_date', ws.confidence_date,
            'performance_score', ws.performance_score,
            'performance_date', ws.performance_date,
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
          AND ws.week_of = p_week_start
          AND ws.assignment_id = ('assign:' || wa.id)::text
        WHERE wa.role_id = p_role_id
          AND wa.week_start_date = p_week_start
          AND wa.status = 'locked'
          AND wa.org_id IS NULL
          AND wa.location_id IS NULL;
      END IF;
    END IF;
  END IF;

  -- If no V2 assignments, try weekly_plan
  IF v_source_used IS NULL THEN
    SELECT COUNT(*) INTO v_required_count
    FROM weekly_plan wp
    WHERE wp.role_id = p_role_id
      AND wp.week_start_date = p_week_start
      AND wp.status = 'locked';

    IF v_required_count > 0 THEN
      v_source_used := 'plan';
      SELECT jsonb_agg(
        jsonb_build_object(
          'focus_id', ('plan:' || wp.id)::text,
          'action_statement', COALESCE(pm.action_statement, 'Self-Select'),
          'domain_name', COALESCE(d.domain_name, 'General'),
          'required', NOT wp.self_select,
          'source', 'plan',
          'confidence_score', ws.confidence_score,
          'confidence_date', ws.confidence_date,
          'performance_score', ws.performance_score,
          'performance_date', ws.performance_date,
          'display_order', wp.display_order,
          'self_select', wp.self_select,
          'competency_id', COALESCE(pm.competency_id, wp.competency_id),
          'action_id', wp.action_id
        ) ORDER BY wp.display_order
      ) INTO v_assignments
      FROM weekly_plan wp
      LEFT JOIN pro_moves pm ON pm.action_id = wp.action_id
      LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, wp.competency_id)
      LEFT JOIN domains d ON d.domain_id = c.domain_id
      LEFT JOIN weekly_scores ws ON 
        ws.staff_id = p_staff_id
        AND ws.week_of = p_week_start
        AND ws.weekly_focus_id = ('plan:' || wp.id)::text
      WHERE wp.role_id = p_role_id
        AND wp.week_start_date = p_week_start
        AND wp.status = 'locked';
    END IF;
  END IF;

  -- If still no assignments, try weekly_focus
  IF v_source_used IS NULL THEN
    SELECT COUNT(*) INTO v_required_count
    FROM weekly_focus wf
    WHERE wf.role_id = p_role_id
      AND wf.cycle = v_cycle
      AND wf.week_in_cycle = v_week_in_cycle;

    IF v_required_count > 0 THEN
      v_source_used := 'focus';
      SELECT jsonb_agg(
        jsonb_build_object(
          'focus_id', wf.id::text,
          'action_statement', COALESCE(pm.action_statement, 'Self-Select'),
          'domain_name', COALESCE(d.domain_name, 'General'),
          'required', NOT wf.self_select,
          'source', 'focus',
          'confidence_score', ws.confidence_score,
          'confidence_date', ws.confidence_date,
          'performance_score', ws.performance_score,
          'performance_date', ws.performance_date,
          'display_order', wf.display_order,
          'self_select', wf.self_select,
          'competency_id', COALESCE(pm.competency_id, wf.competency_id),
          'action_id', wf.action_id
        ) ORDER BY wf.display_order
      ) INTO v_assignments
      FROM weekly_focus wf
      LEFT JOIN pro_moves pm ON pm.action_id = wf.action_id
      LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, wf.competency_id)
      LEFT JOIN domains d ON d.domain_id = c.domain_id
      LEFT JOIN weekly_scores ws ON 
        ws.staff_id = p_staff_id
        AND ws.week_of = p_week_start
        AND ws.weekly_focus_id = wf.id::text
      WHERE wf.role_id = p_role_id
        AND wf.cycle = v_cycle
        AND wf.week_in_cycle = v_week_in_cycle;
    END IF;
  END IF;

  -- Calculate actual scores submitted
  SELECT 
    COUNT(DISTINCT CASE WHEN ws.confidence_score IS NOT NULL THEN ws.id END),
    COUNT(DISTINCT CASE WHEN ws.performance_score IS NOT NULL THEN ws.id END)
  INTO v_conf_count, v_perf_count
  FROM weekly_scores ws
  WHERE ws.staff_id = p_staff_id
    AND ws.week_of = p_week_start;

  -- Get last activity
  SELECT 
    CASE 
      WHEN performance_date >= confidence_date OR confidence_date IS NULL THEN 'performance'
      ELSE 'confidence'
    END,
    GREATEST(performance_date, confidence_date)
  INTO v_last_activity_kind, v_last_activity_at
  FROM weekly_scores
  WHERE staff_id = p_staff_id
    AND week_of = p_week_start
  ORDER BY GREATEST(performance_date, confidence_date) DESC NULLS LAST
  LIMIT 1;

  -- Count backlog
  SELECT COUNT(*) INTO v_backlog_count
  FROM user_backlog_v2
  WHERE staff_id = p_staff_id
    AND resolved_on IS NULL;

  RETURN jsonb_build_object(
    'assignments', COALESCE(v_assignments, '[]'::jsonb),
    'status', jsonb_build_object(
      'required_count', v_required_count,
      'conf_count', v_conf_count,
      'perf_count', v_perf_count,
      'conf_complete', v_conf_count >= v_required_count,
      'perf_complete', v_perf_count >= v_required_count,
      'last_activity_kind', v_last_activity_kind,
      'last_activity_at', v_last_activity_at,
      'backlog_count', v_backlog_count
    ),
    'week_context', jsonb_build_object(
      'cycle', v_cycle,
      'week_in_cycle', v_week_in_cycle,
      'week_of', p_week_start,
      'source', COALESCE(v_source_used, 'none')
    )
  );
END;
$function$;