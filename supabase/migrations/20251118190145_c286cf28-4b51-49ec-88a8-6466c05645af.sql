-- Enhanced version of get_staff_week_assignments that includes status metadata
-- This provides a single source of truth for all coach and staff surfaces

DROP FUNCTION IF EXISTS public.get_staff_week_assignments(uuid, bigint, date);

CREATE OR REPLACE FUNCTION public.get_staff_week_assignments(
  p_staff_id uuid, 
  p_role_id bigint, 
  p_week_start date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cycle int;
  v_week_in_cycle int;
  v_phase text;
  v_cycle_length int;
  v_program_start date;
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

  -- Build assignments array based on phase
  IF v_phase = 'focus' THEN
    -- weekly_focus source
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
    LEFT JOIN weekly_scores ws ON ws.weekly_focus_id = wf.id::text AND ws.staff_id = p_staff_id
    WHERE wf.role_id = p_role_id
      AND wf.cycle = v_cycle
      AND wf.week_in_cycle = v_week_in_cycle;

    -- Count required, conf, perf for focus
    SELECT 
      COUNT(*) FILTER (WHERE NOT wf.self_select),
      COUNT(ws.confidence_score),
      COUNT(ws.performance_score)
    INTO v_required_count, v_conf_count, v_perf_count
    FROM weekly_focus wf
    LEFT JOIN weekly_scores ws ON ws.weekly_focus_id = wf.id::text AND ws.staff_id = p_staff_id
    WHERE wf.role_id = p_role_id
      AND wf.cycle = v_cycle
      AND wf.week_in_cycle = v_week_in_cycle;

    -- Get last activity for focus
    SELECT 
      CASE 
        WHEN ws.performance_score IS NOT NULL THEN 'performance'
        WHEN ws.confidence_score IS NOT NULL THEN 'confidence'
        ELSE NULL
      END,
      CASE 
        WHEN ws.performance_score IS NOT NULL THEN ws.performance_date
        WHEN ws.confidence_score IS NOT NULL THEN ws.confidence_date
        ELSE NULL
      END
    INTO v_last_activity_kind, v_last_activity_at
    FROM weekly_scores ws
    JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
    WHERE ws.staff_id = p_staff_id
      AND wf.cycle = v_cycle
      AND wf.week_in_cycle = v_week_in_cycle
    ORDER BY 
      CASE 
        WHEN ws.performance_score IS NOT NULL THEN ws.performance_date
        WHEN ws.confidence_score IS NOT NULL THEN ws.confidence_date
      END DESC NULLS LAST
    LIMIT 1;

  ELSE
    -- weekly_plan source (cycle 4+)
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
    LEFT JOIN weekly_scores ws ON ws.weekly_focus_id = ('plan:' || wp.id)::text AND ws.staff_id = p_staff_id
    WHERE wp.role_id = p_role_id
      AND wp.week_start_date = p_week_start
      AND wp.status = 'locked';

    -- Count required, conf, perf for plan
    SELECT 
      COUNT(*) FILTER (WHERE NOT wp.self_select),
      COUNT(ws.confidence_score),
      COUNT(ws.performance_score)
    INTO v_required_count, v_conf_count, v_perf_count
    FROM weekly_plan wp
    LEFT JOIN weekly_scores ws ON ws.weekly_focus_id = ('plan:' || wp.id)::text AND ws.staff_id = p_staff_id
    WHERE wp.role_id = p_role_id
      AND wp.week_start_date = p_week_start
      AND wp.status = 'locked';

    -- Get last activity for plan
    SELECT 
      CASE 
        WHEN ws.performance_score IS NOT NULL THEN 'performance'
        WHEN ws.confidence_score IS NOT NULL THEN 'confidence'
        ELSE NULL
      END,
      CASE 
        WHEN ws.performance_score IS NOT NULL THEN ws.performance_date
        WHEN ws.confidence_score IS NOT NULL THEN ws.confidence_date
        ELSE NULL
      END
    INTO v_last_activity_kind, v_last_activity_at
    FROM weekly_scores ws
    WHERE ws.staff_id = p_staff_id
      AND ws.week_of = p_week_start
    ORDER BY 
      CASE 
        WHEN ws.performance_score IS NOT NULL THEN ws.performance_date
        WHEN ws.confidence_score IS NOT NULL THEN ws.confidence_date
      END DESC NULLS LAST
    LIMIT 1;
  END IF;

  -- Get backlog count
  SELECT COUNT(*)::int INTO v_backlog_count
  FROM user_backlog_v2
  WHERE staff_id = p_staff_id
    AND resolved_on IS NULL;

  -- Return unified structure
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
      'source', v_phase
    )
  );
END;
$$;