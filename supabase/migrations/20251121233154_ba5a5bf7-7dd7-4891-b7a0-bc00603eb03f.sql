-- Fix last_conf_at and last_perf_at to show most recent activity across all weeks, not just selected week
DROP FUNCTION IF EXISTS public.get_staff_statuses(uuid, date);

CREATE OR REPLACE FUNCTION public.get_staff_statuses(
  p_coach_user_id uuid,
  p_week_start date DEFAULT NULL
)
RETURNS TABLE(
  staff_id uuid,
  staff_name text,
  email text,
  role_id bigint,
  role_name text,
  location_id uuid,
  location_name text,
  organization_id uuid,
  organization_name text,
  active_monday text,
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
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coach_scope_type text;
  v_coach_scope_id uuid;
  v_is_super_admin boolean;
BEGIN
  -- Get coach info
  SELECT 
    s.coach_scope_type,
    s.coach_scope_id,
    s.is_super_admin
  INTO v_coach_scope_type, v_coach_scope_id, v_is_super_admin
  FROM staff s
  WHERE s.user_id = p_coach_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coach not found';
  END IF;

  RETURN QUERY
  WITH roster AS (
    SELECT DISTINCT
      s.id as staff_id,
      s.name as staff_name,
      s.email,
      s.role_id,
      r.role_name,
      s.primary_location_id as location_id,
      l.name as location_name,
      l.organization_id,
      o.name as organization_name,
      l.timezone as tz
    FROM staff s
    JOIN locations l ON l.id = s.primary_location_id
    JOIN organizations o ON o.id = l.organization_id
    LEFT JOIN roles r ON r.role_id = s.role_id
    WHERE s.is_participant = true
      AND (
        v_is_super_admin
        OR (v_coach_scope_type = 'organization' AND l.organization_id::text = v_coach_scope_id::text)
        OR (v_coach_scope_type = 'location' AND s.primary_location_id::text = v_coach_scope_id::text)
      )
  ),
  week_info AS (
    SELECT
      roster.staff_id,
      roster.location_id,
      roster.organization_id,
      roster.role_id,
      roster.tz,
      COALESCE(
        p_week_start,
        (DATE_TRUNC('week', NOW() AT TIME ZONE roster.tz)::date)
      ) as week_start
    FROM roster
  ),
  assignments_cte AS (
    SELECT
      wi.staff_id,
      wa.id as assignment_id,
      wa.week_start_date,
      1 as is_required
    FROM week_info wi
    JOIN weekly_assignments wa
      ON wa.week_start_date = wi.week_start
      AND wa.role_id = wi.role_id
      AND wa.status = 'locked'
      AND (
        wa.location_id = wi.location_id
        OR (wa.location_id IS NULL AND wa.org_id = wi.organization_id)
        OR (wa.org_id IS NULL AND wa.location_id IS NULL)
      )
  ),
  scores_cte AS (
    SELECT
      ws.staff_id,
      ws.assignment_id,
      ws.confidence_score,
      ws.performance_score,
      ws.confidence_date,
      ws.performance_date,
      ws.confidence_late,
      ws.performance_late
    FROM weekly_scores ws
    WHERE ws.assignment_id IS NOT NULL
  ),
  -- Get last activity across ALL weeks
  last_activity_cte AS (
    SELECT
      ws.staff_id,
      MAX(ws.confidence_date) as last_conf_at,
      MAX(ws.performance_date) as last_perf_at
    FROM weekly_scores ws
    WHERE ws.confidence_date IS NOT NULL OR ws.performance_date IS NOT NULL
    GROUP BY ws.staff_id
  ),
  backlog_cte AS (
    SELECT
      ub.staff_id,
      COUNT(*) as backlog_count
    FROM user_backlog_v2 ub
    WHERE ub.resolved_on IS NULL
    GROUP BY ub.staff_id
  )
  SELECT
    r.staff_id,
    r.staff_name,
    r.email,
    r.role_id,
    r.role_name,
    r.location_id,
    r.location_name,
    r.organization_id,
    r.organization_name,
    TO_CHAR(wi.week_start, 'YYYY-MM-DD') as active_monday,
    COALESCE(COUNT(DISTINCT a.assignment_id), 0)::int as required_count,
    COALESCE(COUNT(DISTINCT CASE WHEN sc.confidence_score IS NOT NULL THEN a.assignment_id END), 0)::int as conf_submitted_count,
    COALESCE(COUNT(DISTINCT CASE WHEN sc.confidence_late = true THEN a.assignment_id END), 0)::int as conf_late_count,
    COALESCE(COUNT(DISTINCT CASE WHEN sc.performance_score IS NOT NULL THEN a.assignment_id END), 0)::int as perf_submitted_count,
    COALESCE(COUNT(DISTINCT CASE WHEN sc.performance_late = true THEN a.assignment_id END), 0)::int as perf_late_count,
    COALESCE(b.backlog_count, 0)::int as backlog_count,
    la.last_conf_at,
    la.last_perf_at,
    r.tz
  FROM roster r
  JOIN week_info wi ON wi.staff_id = r.staff_id
  LEFT JOIN assignments_cte a ON a.staff_id = r.staff_id
  LEFT JOIN scores_cte sc ON sc.staff_id = r.staff_id AND sc.assignment_id = ('assign:' || a.assignment_id)
  LEFT JOIN last_activity_cte la ON la.staff_id = r.staff_id
  LEFT JOIN backlog_cte b ON b.staff_id = r.staff_id
  GROUP BY
    r.staff_id, r.staff_name, r.email, r.role_id, r.role_name,
    r.location_id, r.location_name, r.organization_id, r.organization_name,
    wi.week_start, r.tz, la.last_conf_at, la.last_perf_at, b.backlog_count;
END;
$$;