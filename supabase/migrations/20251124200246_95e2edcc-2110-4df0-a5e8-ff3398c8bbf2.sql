-- Fix date normalization in get_staff_statuses and get_staff_week_assignments
-- Both functions now normalize input dates to Monday of the week

-- Drop and recreate get_staff_statuses with proper date normalization
DROP FUNCTION IF EXISTS get_staff_statuses(date);

CREATE OR REPLACE FUNCTION get_staff_statuses(p_week_start date DEFAULT NULL)
RETURNS TABLE (
  staff_id text,
  staff_name text,
  email text,
  location_id text,
  location_name text,
  organization_id text,
  organization_name text,
  role_id bigint,
  role_name text,
  required_count bigint,
  conf_submitted_count bigint,
  conf_late_count bigint,
  perf_submitted_count bigint,
  perf_late_count bigint,
  last_activity_at timestamptz,
  last_activity_kind text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_week_start date;
  v_coach_scope_type text;
  v_coach_scope_id text;
BEGIN
  -- Normalize week_start to Monday (date_trunc gives us Monday for ISO weeks)
  v_week_start := date_trunc('week', COALESCE(p_week_start, (NOW() AT TIME ZONE 'America/Chicago')::date))::date;

  -- Get current user's coach scope
  SELECT s.coach_scope_type, s.coach_scope_id
  INTO v_coach_scope_type, v_coach_scope_id
  FROM staff s
  WHERE s.user_id = auth.uid();

  -- Return staff within coach's scope
  RETURN QUERY
  WITH coach_staff AS (
    SELECT 
      s.id AS staff_id,
      s.name AS staff_name,
      s.email,
      s.primary_location_id AS location_id,
      s.role_id,
      s.participation_start_at
    FROM staff s
    INNER JOIN locations l ON l.id = s.primary_location_id
    WHERE s.is_participant = true
      AND (
        v_coach_scope_type = 'organization' AND l.organization_id = v_coach_scope_id
        OR v_coach_scope_type = 'location' AND s.primary_location_id = v_coach_scope_id
      )
  ),
  staff_assignments AS (
    SELECT
      cs.staff_id,
      wa.id AS assignment_id,
      wa.action_id,
      wa.competency_id,
      wa.self_select
    FROM coach_staff cs
    CROSS JOIN weekly_assignments wa
    WHERE wa.week_start_date = v_week_start
      AND wa.role_id = cs.role_id
      AND wa.source = 'global'
      AND wa.status = 'locked'
      AND wa.org_id IS NULL
      AND wa.superseded_at IS NULL
  ),
  staff_scores AS (
    SELECT
      sa.staff_id,
      sa.assignment_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_late,
      ws.performance_score,
      ws.performance_date,
      ws.performance_late
    FROM staff_assignments sa
    LEFT JOIN weekly_scores ws 
      ON ws.staff_id = sa.staff_id
      AND ws.assignment_id = sa.assignment_id
  ),
  staff_aggregates AS (
    SELECT
      ss.staff_id,
      COUNT(ss.assignment_id) AS required_count,
      COUNT(ss.confidence_score) AS conf_submitted_count,
      COUNT(CASE WHEN ss.confidence_late = true THEN 1 END) AS conf_late_count,
      COUNT(ss.performance_score) AS perf_submitted_count,
      COUNT(CASE WHEN ss.performance_late = true THEN 1 END) AS perf_late_count,
      MAX(GREATEST(ss.confidence_date, ss.performance_date)) AS last_activity_at,
      CASE 
        WHEN MAX(ss.performance_date) >= MAX(ss.confidence_date) OR MAX(ss.confidence_date) IS NULL THEN 'performance'
        ELSE 'confidence'
      END AS last_activity_kind
    FROM staff_scores ss
    GROUP BY ss.staff_id
  )
  SELECT
    sa.staff_id::text,
    cs.staff_name,
    cs.email,
    cs.location_id::text,
    l.name AS location_name,
    l.organization_id::text,
    o.name AS organization_name,
    cs.role_id,
    r.role_name,
    COALESCE(sa.required_count, 0),
    COALESCE(sa.conf_submitted_count, 0),
    COALESCE(sa.conf_late_count, 0),
    COALESCE(sa.perf_submitted_count, 0),
    COALESCE(sa.perf_late_count, 0),
    sa.last_activity_at,
    sa.last_activity_kind
  FROM coach_staff cs
  INNER JOIN locations l ON l.id = cs.location_id
  INNER JOIN organizations o ON o.id = l.organization_id
  LEFT JOIN roles r ON r.role_id = cs.role_id
  LEFT JOIN staff_aggregates sa ON sa.staff_id = cs.staff_id
  ORDER BY cs.staff_name;
END;
$$;

-- Drop and recreate get_staff_week_assignments with proper date normalization
DROP FUNCTION IF EXISTS get_staff_week_assignments(text, bigint, date);

CREATE OR REPLACE FUNCTION get_staff_week_assignments(
  p_staff_id text,
  p_role_id bigint,
  p_week_start date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_week_start date;
BEGIN
  -- Normalize week_start to Monday
  v_week_start := date_trunc('week', p_week_start)::date;

  WITH assignment_data AS (
    SELECT
      wa.id AS assignment_id,
      wa.action_id,
      wa.competency_id,
      wa.self_select,
      wa.display_order,
      wa.source,
      pm.action_statement,
      COALESCE(c.name, pm_comp.name) AS competency_name,
      COALESCE(d.domain_name, pm_d.domain_name) AS domain_name,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_late,
      ws.performance_score,
      ws.performance_date,
      ws.performance_late
    FROM weekly_assignments wa
    LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
    LEFT JOIN competencies c ON c.competency_id = wa.competency_id
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    LEFT JOIN competencies pm_comp ON pm_comp.competency_id = pm.competency_id
    LEFT JOIN domains pm_d ON pm_d.domain_id = pm_comp.domain_id
    LEFT JOIN weekly_scores ws 
      ON ws.staff_id = p_staff_id
      AND ws.assignment_id = wa.id
    WHERE wa.week_start_date = v_week_start
      AND wa.role_id = p_role_id
      AND wa.source = 'global'
      AND wa.status = 'locked'
      AND wa.org_id IS NULL
      AND wa.superseded_at IS NULL
    ORDER BY wa.display_order
  ),
  aggregated AS (
    SELECT
      COUNT(*) FILTER (WHERE NOT self_select) AS required_count,
      COUNT(confidence_score) FILTER (WHERE NOT self_select) AS conf_count,
      COUNT(performance_score) FILTER (WHERE NOT self_select) AS perf_count,
      COUNT(*) FILTER (WHERE NOT self_select AND confidence_score IS NOT NULL) = COUNT(*) FILTER (WHERE NOT self_select) AS conf_complete,
      COUNT(*) FILTER (WHERE NOT self_select AND performance_score IS NOT NULL) = COUNT(*) FILTER (WHERE NOT self_select) AS perf_complete,
      CASE 
        WHEN MAX(performance_date) >= MAX(confidence_date) OR MAX(confidence_date) IS NULL THEN 'performance'
        ELSE 'confidence'
      END AS last_activity_kind,
      GREATEST(MAX(confidence_date), MAX(performance_date)) AS last_activity_at
    FROM assignment_data
  )
  SELECT jsonb_build_object(
    'assignments', COALESCE(jsonb_agg(
      jsonb_build_object(
        'focus_id', ad.assignment_id,
        'action_statement', ad.action_statement,
        'domain_name', ad.domain_name,
        'required', NOT ad.self_select,
        'source', ad.source,
        'confidence_score', ad.confidence_score,
        'confidence_date', ad.confidence_date,
        'performance_score', ad.performance_score,
        'performance_date', ad.performance_date,
        'display_order', ad.display_order,
        'self_select', ad.self_select,
        'competency_id', ad.competency_id,
        'action_id', ad.action_id
      ) ORDER BY ad.display_order
    ), '[]'::jsonb),
    'status', jsonb_build_object(
      'required_count', COALESCE(agg.required_count, 0),
      'conf_count', COALESCE(agg.conf_count, 0),
      'perf_count', COALESCE(agg.perf_count, 0),
      'conf_complete', COALESCE(agg.conf_complete, false),
      'perf_complete', COALESCE(agg.perf_complete, false),
      'last_activity_kind', agg.last_activity_kind,
      'last_activity_at', agg.last_activity_at,
      'backlog_count', 0
    ),
    'week_context', jsonb_build_object(
      'cycle', 1,
      'week_in_cycle', 1,
      'week_of', v_week_start,
      'source', 'plan'
    )
  )
  INTO v_result
  FROM assignment_data ad
  CROSS JOIN aggregated agg;

  RETURN COALESCE(v_result, jsonb_build_object(
    'assignments', '[]'::jsonb,
    'status', jsonb_build_object(
      'required_count', 0,
      'conf_count', 0,
      'perf_count', 0,
      'conf_complete', false,
      'perf_complete', false,
      'last_activity_kind', null,
      'last_activity_at', null,
      'backlog_count', 0
    ),
    'week_context', jsonb_build_object(
      'cycle', 1,
      'week_in_cycle', 1,
      'week_of', v_week_start,
      'source', 'plan'
    )
  ));
END;
$$;