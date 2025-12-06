
-- Fix get_coach_roster_summary to use coach_scopes table and correct scope_type values
CREATE OR REPLACE FUNCTION public.get_coach_roster_summary(
  p_coach_user_id uuid,
  p_week_start date DEFAULT NULL
)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  role_id bigint,
  role_name text,
  location_id uuid,
  location_name text,
  organization_id uuid,
  organization_name text,
  active_monday date,
  required_count int,
  conf_submitted_count int,
  conf_late_count int,
  perf_submitted_count int,
  perf_late_count int,
  backlog_count int,
  last_conf_at timestamptz,
  last_perf_at timestamptz,
  tz text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_start date;
  v_coach_staff_id uuid;
  v_coach_scope_type text;
  v_coach_scope_id uuid;
  v_is_super_admin boolean;
BEGIN
  -- Normalize to Monday for both provided and default dates
  v_week_start := date_trunc('week', COALESCE(p_week_start, (NOW() AT TIME ZONE 'America/Chicago')::date))::date;

  -- Get coach info
  SELECT s.id, s.coach_scope_type, s.coach_scope_id, s.is_super_admin
  INTO v_coach_staff_id, v_coach_scope_type, v_coach_scope_id, v_is_super_admin
  FROM staff s
  WHERE s.user_id = p_coach_user_id
    AND (s.is_coach OR s.is_lead OR s.is_super_admin OR s.is_org_admin)
  LIMIT 1;

  -- If not authorized, return empty
  IF v_coach_staff_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH coach_scopes_expanded AS (
    -- Get all scopes from coach_scopes table
    SELECT cs.scope_type, cs.scope_id
    FROM coach_scopes cs
    WHERE cs.staff_id = v_coach_staff_id
    
    UNION
    
    -- Also include legacy scope from staff table
    SELECT v_coach_scope_type, v_coach_scope_id
    WHERE v_coach_scope_type IS NOT NULL AND v_coach_scope_id IS NOT NULL
  ),
  visible_staff AS (
    SELECT DISTINCT s.id AS staff_id
    FROM staff s
    INNER JOIN locations l ON l.id = s.primary_location_id
    WHERE s.is_participant
      AND s.primary_location_id IS NOT NULL
      AND (
        v_is_super_admin = true
        OR EXISTS (
          SELECT 1 FROM coach_scopes_expanded cse
          WHERE (cse.scope_type = 'org' AND l.organization_id = cse.scope_id)
             OR (cse.scope_type = 'location' AND l.id = cse.scope_id)
        )
      )
  ),
  staff_assignments AS (
    SELECT 
      vs.staff_id,
      wa.id AS assignment_id
    FROM visible_staff vs
    INNER JOIN staff st ON st.id = vs.staff_id
    LEFT JOIN weekly_assignments wa ON 
      wa.role_id = st.role_id
      AND wa.week_start_date = v_week_start
      AND wa.status = 'locked'
      AND (wa.org_id IS NULL OR wa.org_id = (SELECT l2.organization_id FROM locations l2 WHERE l2.id = st.primary_location_id))
      AND (wa.location_id IS NULL OR wa.location_id = st.primary_location_id)
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
    LEFT JOIN weekly_scores ws ON
      ws.staff_id = sa.staff_id
      AND ws.assignment_id = ('assign:' || sa.assignment_id)
  ),
  staff_backlog AS (
    SELECT
      ub.staff_id,
      COUNT(*) AS backlog_count
    FROM user_backlog_v2 ub
    WHERE ub.resolved_on IS NULL
    GROUP BY ub.staff_id
  ),
  staff_aggregates AS (
    SELECT
      ss.staff_id,
      COUNT(ss.assignment_id) AS required_count,
      COUNT(ss.confidence_score) AS conf_submitted_count,
      SUM(CASE WHEN ss.confidence_late = true THEN 1 ELSE 0 END) AS conf_late_count,
      COUNT(ss.performance_score) AS perf_submitted_count,
      SUM(CASE WHEN ss.performance_late = true THEN 1 ELSE 0 END) AS perf_late_count,
      MAX(ss.confidence_date) AS last_conf_at,
      MAX(ss.performance_date) AS last_perf_at
    FROM staff_scores ss
    WHERE ss.assignment_id IS NOT NULL
    GROUP BY ss.staff_id
  )
  SELECT
    s.id AS staff_id,
    s.name AS staff_name,
    s.role_id::bigint,
    r.role_name,
    s.primary_location_id AS location_id,
    l.name AS location_name,
    l.organization_id,
    o.name AS organization_name,
    v_week_start AS active_monday,
    COALESCE(sa.required_count, 0)::int AS required_count,
    COALESCE(sa.conf_submitted_count, 0)::int AS conf_submitted_count,
    COALESCE(sa.conf_late_count, 0)::int AS conf_late_count,
    COALESCE(sa.perf_submitted_count, 0)::int AS perf_submitted_count,
    COALESCE(sa.perf_late_count, 0)::int AS perf_late_count,
    COALESCE(sb.backlog_count, 0)::int AS backlog_count,
    sa.last_conf_at,
    sa.last_perf_at,
    l.timezone AS tz
  FROM visible_staff vs
  INNER JOIN staff s ON s.id = vs.staff_id
  LEFT JOIN roles r ON r.role_id = s.role_id
  LEFT JOIN locations l ON l.id = s.primary_location_id
  LEFT JOIN organizations o ON o.id = l.organization_id
  LEFT JOIN staff_aggregates sa ON sa.staff_id = s.id
  LEFT JOIN staff_backlog sb ON sb.staff_id = s.id
  ORDER BY s.name;
END;
$$;