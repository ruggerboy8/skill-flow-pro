-- Priority 2A: Update Database Layer for V2 Assignment System

-- Step 1: Update view_weekly_scores_with_competency to support weekly_assignments
DROP VIEW IF EXISTS view_weekly_scores_with_competency;

CREATE VIEW view_weekly_scores_with_competency AS
SELECT 
  ws.id as weekly_score_id,
  ws.staff_id,
  ws.weekly_focus_id,
  ws.confidence_score,
  ws.performance_score,
  ws.created_at,
  ws.week_of,
  s.role_id,
  s.primary_location_id,
  l.organization_id,
  -- Get action_id from all three sources
  COALESCE(
    wf.action_id,
    wp.action_id,
    wa.action_id,
    ws.site_action_id,
    ws.selected_action_id
  ) as action_id,
  -- Get competency_id from all three sources
  COALESCE(
    pm_wf.competency_id,
    wp.competency_id,
    wa.competency_id,
    pm_site.competency_id,
    pm_sel.competency_id
  ) as competency_id,
  -- Get domain info
  d.domain_id,
  d.domain_name
FROM weekly_scores ws
JOIN staff s ON s.id = ws.staff_id
LEFT JOIN locations l ON l.id = s.primary_location_id
-- Join to weekly_focus (legacy)
LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
LEFT JOIN pro_moves pm_wf ON pm_wf.action_id = wf.action_id
-- Join to weekly_plan (legacy)
LEFT JOIN weekly_plan wp ON ('plan:' || wp.id) = ws.weekly_focus_id
LEFT JOIN pro_moves pm_wp ON pm_wp.action_id = wp.action_id
-- Join to weekly_assignments (V2) via assignment_id
LEFT JOIN weekly_assignments wa ON wa.id::text = ws.assignment_id
LEFT JOIN pro_moves pm_wa ON pm_wa.action_id = wa.action_id
-- Join via site_action_id and selected_action_id as fallback
LEFT JOIN pro_moves pm_site ON pm_site.action_id = ws.site_action_id
LEFT JOIN pro_moves pm_sel ON pm_sel.action_id = ws.selected_action_id
-- Get domain from any available competency
LEFT JOIN competencies c ON c.competency_id = COALESCE(
  pm_wf.competency_id,
  pm_wp.competency_id,
  pm_wa.competency_id,
  pm_site.competency_id,
  pm_sel.competency_id
)
LEFT JOIN domains d ON d.domain_id = c.domain_id;

-- Step 2: Update get_staff_week_assignments to support weekly_assignments
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

  -- Check for V2 assignments first (location-specific or org-specific)
  SELECT COUNT(*) INTO v_required_count
  FROM weekly_assignments wa
  WHERE wa.role_id = p_role_id
    AND wa.week_start_date = p_week_start
    AND wa.status = 'locked'
    AND (
      wa.location_id = v_location_id
      OR (wa.org_id = v_org_id AND wa.location_id IS NULL)
      OR (wa.org_id IS NULL AND wa.location_id IS NULL)
    );

  IF v_required_count > 0 THEN
    -- Use V2 assignments
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
    LEFT JOIN LATERAL (
      SELECT confidence_score, confidence_date, performance_score, performance_date
      FROM weekly_scores
      WHERE staff_id = p_staff_id
        AND (
          assignment_id = wa.id::text
          OR (week_of = p_week_start AND site_action_id = wa.action_id)
        )
      ORDER BY 
        CASE WHEN assignment_id = wa.id::text THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    ) ws ON true
    WHERE wa.role_id = p_role_id
      AND wa.week_start_date = p_week_start
      AND wa.status = 'locked'
      AND (
        wa.location_id = v_location_id
        OR (wa.org_id = v_org_id AND wa.location_id IS NULL)
        OR (wa.org_id IS NULL AND wa.location_id IS NULL)
      );

    -- Count scores
    SELECT 
      COUNT(*) FILTER (WHERE NOT wa.self_select),
      COUNT(ws.confidence_score),
      COUNT(ws.performance_score)
    INTO v_required_count, v_conf_count, v_perf_count
    FROM weekly_assignments wa
    LEFT JOIN LATERAL (
      SELECT confidence_score, performance_score
      FROM weekly_scores
      WHERE staff_id = p_staff_id
        AND (
          assignment_id = wa.id::text
          OR (week_of = p_week_start AND site_action_id = wa.action_id)
        )
      LIMIT 1
    ) ws ON true
    WHERE wa.role_id = p_role_id
      AND wa.week_start_date = p_week_start
      AND wa.status = 'locked'
      AND (
        wa.location_id = v_location_id
        OR (wa.org_id = v_org_id AND wa.location_id IS NULL)
        OR (wa.org_id IS NULL AND wa.location_id IS NULL)
      );

    -- Get last activity
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
      GREATEST(ws.performance_date, ws.confidence_date) DESC NULLS LAST
    LIMIT 1;

  ELSIF v_phase = 'focus' THEN
    -- Use legacy weekly_focus
    WITH week_scores AS (
      SELECT 
        confidence_score,
        confidence_date,
        performance_score,
        performance_date,
        site_action_id,
        ROW_NUMBER() OVER (ORDER BY created_at) as score_position
      FROM weekly_scores
      WHERE staff_id = p_staff_id
        AND week_of = p_week_start
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'focus_id', wf.id::text,
        'action_statement', CASE
          WHEN ws_by_position.site_action_id IS NOT NULL THEN 
            COALESCE((SELECT action_statement FROM pro_moves WHERE action_id = ws_by_position.site_action_id), pm.action_statement, 'Self-Select')
          ELSE
            COALESCE(pm.action_statement, 'Self-Select')
        END,
        'domain_name', CASE
          WHEN ws_by_position.site_action_id IS NOT NULL THEN
            COALESCE(
              (SELECT d2.domain_name FROM pro_moves pm2 
               JOIN competencies c2 ON c2.competency_id = pm2.competency_id 
               JOIN domains d2 ON d2.domain_id = c2.domain_id 
               WHERE pm2.action_id = ws_by_position.site_action_id),
              d.domain_name, 
              'General'
            )
          ELSE
            COALESCE(d.domain_name, 'General')
        END,
        'required', NOT wf.self_select,
        'source', 'focus',
        'confidence_score', COALESCE(ws_by_id.confidence_score, ws_by_position.confidence_score),
        'confidence_date', COALESCE(ws_by_id.confidence_date, ws_by_position.confidence_date),
        'performance_score', COALESCE(ws_by_id.performance_score, ws_by_position.performance_score),
        'performance_date', COALESCE(ws_by_id.performance_date, ws_by_position.performance_date),
        'display_order', wf.display_order,
        'self_select', wf.self_select,
        'competency_id', CASE
          WHEN ws_by_position.site_action_id IS NOT NULL THEN
            COALESCE((SELECT competency_id FROM pro_moves WHERE action_id = ws_by_position.site_action_id), pm.competency_id, wf.competency_id)
          ELSE
            COALESCE(pm.competency_id, wf.competency_id)
        END,
        'action_id', COALESCE(ws_by_position.site_action_id, wf.action_id)
      ) ORDER BY wf.display_order
    ) INTO v_assignments
    FROM weekly_focus wf
    LEFT JOIN pro_moves pm ON pm.action_id = wf.action_id
    LEFT JOIN competencies c ON c.competency_id = COALESCE(pm.competency_id, wf.competency_id)
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    LEFT JOIN LATERAL (
      SELECT confidence_score, confidence_date, performance_score, performance_date
      FROM weekly_scores
      WHERE staff_id = p_staff_id AND weekly_focus_id = wf.id::text
      LIMIT 1
    ) ws_by_id ON true
    LEFT JOIN week_scores ws_by_position ON ws_by_position.score_position = wf.display_order
    WHERE wf.role_id = p_role_id
      AND wf.cycle = v_cycle
      AND wf.week_in_cycle = v_week_in_cycle;

    SELECT 
      COUNT(*) FILTER (WHERE NOT wf.self_select),
      COUNT(COALESCE(ws_by_id.confidence_score, ws_by_position.confidence_score)),
      COUNT(COALESCE(ws_by_id.performance_score, ws_by_position.performance_score))
    INTO v_required_count, v_conf_count, v_perf_count
    FROM weekly_focus wf
    LEFT JOIN LATERAL (
      SELECT confidence_score, performance_score
      FROM weekly_scores
      WHERE staff_id = p_staff_id AND weekly_focus_id = wf.id::text
      LIMIT 1
    ) ws_by_id ON true
    LEFT JOIN (
      SELECT 
        confidence_score,
        performance_score,
        ROW_NUMBER() OVER (ORDER BY created_at) as score_position
      FROM weekly_scores
      WHERE staff_id = p_staff_id AND week_of = p_week_start
    ) ws_by_position ON ws_by_position.score_position = wf.display_order
    WHERE wf.role_id = p_role_id
      AND wf.cycle = v_cycle
      AND wf.week_in_cycle = v_week_in_cycle;

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
      GREATEST(ws.performance_date, ws.confidence_date) DESC NULLS LAST
    LIMIT 1;

  ELSE
    -- Use legacy weekly_plan
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
    LEFT JOIN LATERAL (
      SELECT confidence_score, confidence_date, performance_score, performance_date
      FROM weekly_scores
      WHERE staff_id = p_staff_id
        AND (
          weekly_focus_id = ('plan:' || wp.id)::text
          OR (week_of = p_week_start AND site_action_id = wp.action_id)
        )
      ORDER BY 
        CASE WHEN weekly_focus_id = ('plan:' || wp.id)::text THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    ) ws ON true
    WHERE wp.role_id = p_role_id
      AND wp.week_start_date = p_week_start
      AND wp.status = 'locked';

    SELECT 
      COUNT(*) FILTER (WHERE NOT wp.self_select),
      COUNT(ws.confidence_score),
      COUNT(ws.performance_score)
    INTO v_required_count, v_conf_count, v_perf_count
    FROM weekly_plan wp
    LEFT JOIN LATERAL (
      SELECT confidence_score, performance_score
      FROM weekly_scores
      WHERE staff_id = p_staff_id
        AND (
          weekly_focus_id = ('plan:' || wp.id)::text
          OR (week_of = p_week_start AND site_action_id = wp.action_id)
        )
      LIMIT 1
    ) ws ON true
    WHERE wp.role_id = p_role_id
      AND wp.week_start_date = p_week_start
      AND wp.status = 'locked';

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
      GREATEST(ws.performance_date, ws.confidence_date) DESC NULLS LAST
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
      'source', CASE 
        WHEN v_required_count > 0 AND v_assignments::text LIKE '%assign:%' THEN 'assignments'
        WHEN v_phase = 'focus' THEN 'focus'
        ELSE 'plan'
      END
    )
  );
END;
$function$;

-- Step 3: Update get_staff_statuses to support weekly_assignments
CREATE OR REPLACE FUNCTION public.get_staff_statuses(
  p_coach_user_id uuid,
  p_now timestamp with time zone DEFAULT now()
)
RETURNS TABLE(
  staff_id uuid,
  staff_name text,
  role_id bigint,
  role_name text,
  location_id uuid,
  location_name text,
  organization_id uuid,
  organization_name text,
  active_monday date,
  cycle_number integer,
  week_in_cycle integer,
  phase text,
  checkin_due timestamp with time zone,
  checkout_open timestamp with time zone,
  checkout_due timestamp with time zone,
  required_count integer,
  conf_count integer,
  perf_count integer,
  backlog_count integer,
  last_activity_kind text,
  last_activity_at timestamp with time zone,
  source_used text,
  tz text
)
LANGUAGE sql
STABLE
AS $function$
WITH coach_info AS (
  SELECT 
    s.is_super_admin,
    l.organization_id
  FROM staff s
  LEFT JOIN locations l ON l.id = s.primary_location_id
  WHERE s.user_id = p_coach_user_id
),
visible_staff AS (
  SELECT 
    s.id AS staff_id, 
    s.name AS staff_name, 
    s.role_id::bigint AS role_id,
    s.primary_location_id AS location_id,
    r.role_name, 
    l.name AS location_name, 
    l.timezone AS tz,
    l.organization_id, 
    o.name AS organization_name,
    l.program_start_date, 
    l.cycle_length_weeks
  FROM staff s
  JOIN roles r ON r.role_id = s.role_id
  JOIN locations l ON l.id = s.primary_location_id
  JOIN organizations o ON o.id = l.organization_id
  CROSS JOIN coach_info ci
  WHERE s.is_participant = TRUE
    AND (ci.is_super_admin OR l.organization_id = ci.organization_id)
),
week_ctx AS (
  SELECT
    vs.*,
    (date_trunc('week', (p_now AT TIME ZONE vs.tz))::date) AS active_monday,
    GREATEST(0,
      ((date_trunc('week', (p_now AT TIME ZONE vs.tz))::date)
       - (date_trunc('week', vs.program_start_date::timestamp AT TIME ZONE vs.tz)::date)) / 7
    )::int AS week_index
  FROM visible_staff vs
),
cycle_calc AS (
  SELECT
    wc.*,
    CASE 
      WHEN wc.week_index = 0 THEN 1
      ELSE (wc.week_index / wc.cycle_length_weeks)::int + 1
    END AS cycle_number,
    CASE 
      WHEN wc.week_index = 0 THEN 1
      ELSE (wc.week_index % wc.cycle_length_weeks)::int + 1
    END AS week_in_cycle
  FROM week_ctx wc
),
phase_calc AS (
  SELECT
    cc.*,
    CASE 
      WHEN cc.cycle_number <= 3 THEN 'focus' 
      ELSE 'plan' 
    END AS phase
  FROM cycle_calc cc
),
anchors AS (
  SELECT
    pc.*,
    ((pc.active_monday + 1) || ' 12:00:00 ' || pc.tz)::timestamptz AS checkin_due,
    ((pc.active_monday + 3) || ' 00:00:00 ' || pc.tz)::timestamptz AS checkout_open,
    ((pc.active_monday + 4) || ' 17:00:00 ' || pc.tz)::timestamptz AS checkout_due
  FROM phase_calc pc
),
source_choice AS (
  SELECT
    a.*,
    CASE
      -- Check for V2 assignments first
      WHEN EXISTS (
        SELECT 1 FROM weekly_assignments wa
        WHERE wa.role_id = a.role_id::int
          AND wa.week_start_date = a.active_monday
          AND wa.status = 'locked'
          AND (
            wa.location_id = a.location_id
            OR (wa.org_id = a.organization_id AND wa.location_id IS NULL)
            OR (wa.org_id IS NULL AND wa.location_id IS NULL)
          )
      ) THEN 'assignments'
      WHEN a.cycle_number >= 4 THEN 'plan'
      ELSE 'focus'
    END AS source_used
  FROM anchors a
),
assignments AS (
  SELECT
    sc.*,
    CASE
      WHEN sc.source_used = 'assignments' THEN (
        SELECT COUNT(*)::int
        FROM weekly_assignments wa
        WHERE wa.role_id = sc.role_id::int
          AND wa.week_start_date = sc.active_monday
          AND wa.status = 'locked'
          AND wa.self_select = false
          AND (
            wa.location_id = sc.location_id
            OR (wa.org_id = sc.organization_id AND wa.location_id IS NULL)
            OR (wa.org_id IS NULL AND wa.location_id IS NULL)
          )
      )
      WHEN sc.source_used = 'plan' THEN (
        SELECT COUNT(*)::int
        FROM weekly_plan wp
        WHERE wp.role_id = sc.role_id::int
          AND wp.week_start_date = sc.active_monday
          AND wp.status = 'locked'
          AND wp.self_select = false
          AND (wp.org_id = sc.organization_id OR 
               (wp.org_id IS NULL AND NOT EXISTS (
                 SELECT 1 FROM weekly_plan wpo
                 WHERE wpo.role_id = sc.role_id::int
                   AND wpo.week_start_date = sc.active_monday
                   AND wpo.status = 'locked'
                   AND wpo.org_id = sc.organization_id
               )))
      )
      ELSE (
        SELECT COUNT(*)::int
        FROM weekly_focus wf
        WHERE wf.role_id = sc.role_id
          AND wf.cycle = sc.cycle_number
          AND wf.week_in_cycle = sc.week_in_cycle
          AND wf.self_select = false
      )
    END AS required_count
  FROM source_choice sc
),
scores AS (
  SELECT
    a.*,
    (
      SELECT COUNT(*)::int
      FROM weekly_scores ws
      LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
      LEFT JOIN weekly_assignments wa ON wa.id::text = ws.assignment_id
      WHERE ws.staff_id = a.staff_id
        AND ws.confidence_score IS NOT NULL
        AND (
          (wf.id IS NOT NULL AND wf.cycle = a.cycle_number AND wf.week_in_cycle = a.week_in_cycle)
          OR (wa.id IS NOT NULL AND wa.week_start_date = a.active_monday)
          OR (wf.id IS NULL AND wa.id IS NULL AND ws.week_of = a.active_monday)
        )
    ) AS conf_count,
    (
      SELECT COUNT(*)::int
      FROM weekly_scores ws
      LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
      LEFT JOIN weekly_assignments wa ON wa.id::text = ws.assignment_id
      WHERE ws.staff_id = a.staff_id
        AND ws.performance_score IS NOT NULL
        AND (
          (wf.id IS NOT NULL AND wf.cycle = a.cycle_number AND wf.week_in_cycle = a.week_in_cycle)
          OR (wa.id IS NOT NULL AND wa.week_start_date = a.active_monday)
          OR (wf.id IS NULL AND wa.id IS NULL AND ws.week_of = a.active_monday)
        )
    ) AS perf_count,
    (
      SELECT CASE 
        WHEN ws.performance_score IS NOT NULL THEN 'performance'
        WHEN ws.confidence_score IS NOT NULL THEN 'confidence'
        ELSE NULL
      END
      FROM weekly_scores ws
      WHERE ws.staff_id = a.staff_id
        AND (ws.confidence_score IS NOT NULL OR ws.performance_score IS NOT NULL)
      ORDER BY 
        CASE 
          WHEN ws.performance_score IS NOT NULL THEN 0
          WHEN ws.confidence_score IS NOT NULL THEN 1
          ELSE 2
        END,
        COALESCE(ws.performance_date, ws.confidence_date) DESC NULLS LAST
      LIMIT 1
    ) AS last_activity_kind,
    (
      SELECT CASE 
        WHEN ws.performance_score IS NOT NULL THEN ws.performance_date
        WHEN ws.confidence_score IS NOT NULL THEN ws.confidence_date
        ELSE NULL
      END
      FROM weekly_scores ws
      WHERE ws.staff_id = a.staff_id
        AND (ws.confidence_score IS NOT NULL OR ws.performance_score IS NOT NULL)
      ORDER BY 
        CASE 
          WHEN ws.performance_score IS NOT NULL THEN 0
          WHEN ws.confidence_score IS NOT NULL THEN 1
          ELSE 2
        END,
        COALESCE(ws.performance_date, ws.confidence_date) DESC NULLS LAST
      LIMIT 1
    ) AS last_activity_at
  FROM assignments a
),
backlog_calc AS (
  SELECT
    s.*,
    COALESCE((
      SELECT COUNT(*)::int
      FROM user_backlog_v2 ub
      WHERE ub.staff_id = s.staff_id
        AND ub.resolved_on IS NULL
    ), 0) AS backlog_count
  FROM scores s
)
SELECT 
  bc.staff_id,
  bc.staff_name,
  bc.role_id,
  bc.role_name,
  bc.location_id,
  bc.location_name,
  bc.organization_id,
  bc.organization_name,
  bc.active_monday,
  bc.cycle_number,
  bc.week_in_cycle,
  bc.phase,
  bc.checkin_due,
  bc.checkout_open,
  bc.checkout_due,
  bc.required_count,
  bc.conf_count,
  bc.perf_count,
  bc.backlog_count,
  bc.last_activity_kind,
  bc.last_activity_at,
  bc.source_used,
  bc.tz
FROM backlog_calc bc
ORDER BY 
  bc.organization_name,
  bc.location_name,
  bc.staff_name;
$function$;