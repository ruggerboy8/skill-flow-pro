-- Drop existing function
DROP FUNCTION IF EXISTS get_staff_statuses(uuid, date);

-- Create function to get staff statuses for coach dashboard
CREATE OR REPLACE FUNCTION get_staff_statuses(
  p_coach_user_id uuid,
  p_week_start date DEFAULT NULL
)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  role_id integer,
  role_name text,
  location_id uuid,
  location_name text,
  organization_id uuid,
  organization_name text,
  active_monday text,
  required_count integer,
  conf_submitted_count bigint,
  conf_late_count bigint,
  perf_submitted_count bigint,
  perf_late_count bigint,
  backlog_count bigint,
  last_conf_at timestamp with time zone,
  last_perf_at timestamp with time zone,
  tz text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_week_start date;
BEGIN
  -- Use provided week or calculate current week
  v_week_start := COALESCE(
    p_week_start,
    date_trunc('week', CURRENT_DATE)::date + 
      CASE WHEN EXTRACT(dow FROM CURRENT_DATE) = 0 THEN -6 ELSE 1 END
  );

  RETURN QUERY
  WITH staff_in_scope AS (
    SELECT DISTINCT s.id, s.name, s.role_id, s.primary_location_id
    FROM staff s
    WHERE s.is_participant = true
      AND s.primary_location_id IS NOT NULL
      AND s.role_id IS NOT NULL
  ),
  week_scores AS (
    SELECT 
      ws.staff_id,
      COUNT(*) FILTER (WHERE ws.confidence_score IS NOT NULL) as conf_count,
      COUNT(*) FILTER (WHERE ws.confidence_score IS NOT NULL AND ws.confidence_late = true) as conf_late,
      COUNT(*) FILTER (WHERE ws.performance_score IS NOT NULL) as perf_count,
      COUNT(*) FILTER (WHERE ws.performance_score IS NOT NULL AND ws.performance_late = true) as perf_late,
      MAX(ws.confidence_date) as last_conf,
      MAX(ws.performance_date) as last_perf
    FROM weekly_scores ws
    WHERE ws.week_of = v_week_start
    GROUP BY ws.staff_id
  ),
  backlog AS (
    SELECT
      b.staff_id,
      COUNT(*) as backlog_count
    FROM user_backlog_v2 b
    WHERE b.resolved_on IS NULL
    GROUP BY b.staff_id
  )
  SELECT 
    s.id::uuid,
    s.name::text,
    s.role_id::integer,
    r.role_name::text,
    l.id::uuid,
    l.name::text,
    o.id::uuid,
    o.name::text,
    v_week_start::text as active_monday,
    3::integer as required_count,
    COALESCE(ws.conf_count, 0)::bigint,
    COALESCE(ws.conf_late, 0)::bigint,
    COALESCE(ws.perf_count, 0)::bigint,
    COALESCE(ws.perf_late, 0)::bigint,
    COALESCE(b.backlog_count, 0)::bigint,
    ws.last_conf,
    ws.last_perf,
    l.timezone::text
  FROM staff_in_scope s
  INNER JOIN roles r ON r.role_id = s.role_id
  INNER JOIN locations l ON l.id = s.primary_location_id
  INNER JOIN organizations o ON o.id = l.organization_id
  LEFT JOIN week_scores ws ON ws.staff_id = s.id
  LEFT JOIN backlog b ON b.staff_id = s.id
  ORDER BY s.name;
END;
$$;