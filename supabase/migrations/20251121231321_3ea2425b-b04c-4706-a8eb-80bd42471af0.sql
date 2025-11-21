-- Fix get_staff_statuses function - remove invalid extract() call
DROP FUNCTION IF EXISTS public.get_staff_statuses(uuid);

CREATE OR REPLACE FUNCTION public.get_staff_statuses(p_coach_user_id uuid)
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
  required_count integer,
  conf_submitted_count integer,
  perf_submitted_count integer,
  backlog_count integer,
  last_conf_at timestamptz,
  last_perf_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  coach_scope_type text;
  coach_scope_id uuid;
  is_admin boolean;
BEGIN
  -- Get coach info
  SELECT s.coach_scope_type, s.coach_scope_id, s.is_super_admin
  INTO coach_scope_type, coach_scope_id, is_admin
  FROM staff s
  WHERE s.user_id = p_coach_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coach not found';
  END IF;

  RETURN QUERY
  WITH roster AS (
    SELECT 
      s.id as staff_id,
      s.name as staff_name,
      s.email,
      s.role_id,
      r.role_name,
      s.primary_location_id as location_id,
      l.name as location_name,
      l.organization_id,
      o.name as organization_name,
      l.timezone as tz,
      l.program_start_date,
      l.cycle_length_weeks
    FROM staff s
    JOIN roles r ON r.role_id = s.role_id
    LEFT JOIN locations l ON l.id = s.primary_location_id
    LEFT JOIN organizations o ON o.id = l.organization_id
    WHERE s.is_participant = true
      AND s.primary_location_id IS NOT NULL
      AND (
        is_admin = true
        OR (coach_scope_type = 'organization' AND l.organization_id::text = coach_scope_id::text)
        OR (coach_scope_type = 'location' AND s.primary_location_id::text = coach_scope_id::text)
      )
  ),
  current_week_info AS (
    SELECT 
      r.staff_id,
      r.location_id,
      r.organization_id,
      r.role_id,
      r.tz,
      (CURRENT_DATE - ((EXTRACT(DOW FROM (CURRENT_TIMESTAMP AT TIME ZONE r.tz)::date)::integer + 6) % 7))::date as week_start
    FROM roster r
  ),
  assignments_cte AS (
    -- Prioritize weekly_assignments
    SELECT 
      cwi.staff_id,
      wa.id::text as assignment_id,
      wa.action_id,
      wa.competency_id
    FROM current_week_info cwi
    JOIN weekly_assignments wa ON wa.week_start_date = cwi.week_start
      AND wa.role_id = cwi.role_id
      AND wa.status = 'locked'
      AND (
        wa.location_id = cwi.location_id
        OR (wa.location_id IS NULL AND wa.org_id = cwi.organization_id)
        OR (wa.org_id IS NULL AND wa.location_id IS NULL)
      )
    
    UNION ALL
    
    -- Fallback to weekly_focus only if no weekly_assignments exist
    SELECT 
      cwi.staff_id,
      wf.id::text as assignment_id,
      wf.action_id,
      wf.competency_id
    FROM current_week_info cwi
    JOIN weekly_focus wf ON wf.role_id = cwi.role_id
    WHERE NOT EXISTS (
      SELECT 1 FROM weekly_assignments wa2
      WHERE wa2.week_start_date = cwi.week_start
        AND wa2.role_id = cwi.role_id
        AND wa2.status = 'locked'
    )
  ),
  scores_cte AS (
    SELECT 
      ws.staff_id,
      ws.assignment_id,
      ws.confidence_score,
      ws.performance_score,
      ws.confidence_date,
      ws.performance_date
    FROM weekly_scores ws
    WHERE ws.assignment_id IS NOT NULL
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
    COUNT(DISTINCT a.assignment_id)::integer as required_count,
    COUNT(DISTINCT CASE WHEN sc.confidence_score IS NOT NULL THEN a.assignment_id END)::integer as conf_submitted_count,
    COUNT(DISTINCT CASE WHEN sc.performance_score IS NOT NULL THEN a.assignment_id END)::integer as perf_submitted_count,
    COALESCE(b.backlog_count, 0)::integer as backlog_count,
    MAX(sc.confidence_date) as last_conf_at,
    MAX(sc.performance_date) as last_perf_at
  FROM roster r
  LEFT JOIN assignments_cte a ON a.staff_id = r.staff_id
  LEFT JOIN scores_cte sc ON sc.staff_id = r.staff_id 
    AND sc.assignment_id = ('assign:' || a.assignment_id)
  LEFT JOIN backlog_cte b ON b.staff_id = r.staff_id
  GROUP BY r.staff_id, r.staff_name, r.email, r.role_id, r.role_name, 
           r.location_id, r.location_name, r.organization_id, r.organization_name,
           b.backlog_count;
END;
$$;