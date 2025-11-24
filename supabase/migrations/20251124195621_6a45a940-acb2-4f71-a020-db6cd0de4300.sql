-- Fix get_staff_statuses aggregation logic to correctly count required vs submitted
DROP FUNCTION IF EXISTS public.get_staff_statuses(uuid, date);

CREATE OR REPLACE FUNCTION public.get_staff_statuses(
  p_coach_user_id uuid,
  p_week_start date DEFAULT NULL
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
  required_count integer,
  conf_submitted_count integer,
  conf_late_count integer,
  perf_submitted_count integer,
  perf_late_count integer,
  backlog_count integer,
  last_conf_at timestamp with time zone,
  last_perf_at timestamp with time zone,
  tz text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_week_start date;
BEGIN
  IF p_week_start IS NOT NULL THEN
    v_week_start := p_week_start;
  ELSE
    v_week_start := date_trunc('week', (NOW() AT TIME ZONE 'America/Chicago')::date)::date + INTERVAL '1 day';
  END IF;

  RETURN QUERY
  WITH coach_scope AS (
    SELECT 
      s.coach_scope_type,
      s.coach_scope_id
    FROM staff s
    WHERE s.user_id = p_coach_user_id
      AND (s.is_coach OR s.is_lead OR s.is_super_admin)
    LIMIT 1
  ),
  visible_staff AS (
    SELECT DISTINCT s.id AS staff_id
    FROM staff s
    CROSS JOIN coach_scope cs
    LEFT JOIN locations l ON l.id = s.primary_location_id
    WHERE s.is_participant
      AND s.primary_location_id IS NOT NULL
      AND (
        (cs.coach_scope_type = 'organization' AND l.organization_id = cs.coach_scope_id::uuid)
        OR (cs.coach_scope_type = 'location' AND s.primary_location_id = cs.coach_scope_id::uuid)
        OR (cs.coach_scope_type IS NULL)
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
      AND (wa.org_id IS NULL OR wa.org_id = (SELECT l.organization_id FROM locations l WHERE l.id = st.primary_location_id))
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
$function$;