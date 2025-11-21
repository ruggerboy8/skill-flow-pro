
-- Drop all versions of get_staff_statuses to resolve overloading conflict
DROP FUNCTION IF EXISTS public.get_staff_statuses(uuid);
DROP FUNCTION IF EXISTS public.get_staff_statuses(uuid, timestamptz);

-- Recreate the function with only the single parameter version
CREATE OR REPLACE FUNCTION public.get_staff_statuses(p_coach_user_id uuid)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  role_id int,
  role_name text,
  location_id uuid,
  location_name text,
  organization_id uuid,
  organization_name text,
  active_monday date,
  cycle_number int,
  week_in_cycle int,
  phase text,
  checkin_due timestamptz,
  checkout_open timestamptz,
  checkout_due timestamptz,
  required_count bigint,
  conf_count bigint,
  perf_count bigint,
  backlog_count bigint,
  last_activity_kind text,
  last_activity_at timestamptz,
  source_used text,
  tz text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_coach_staff_id uuid;
  v_scope_type text;
  v_scope_id uuid;
BEGIN
  -- Get coach staff record
  SELECT s.id, s.is_super_admin, s.coach_scope_type, s.coach_scope_id
  INTO v_coach_staff_id, v_is_admin, v_scope_type, v_scope_id
  FROM staff s
  WHERE s.user_id = p_coach_user_id;

  IF v_coach_staff_id IS NULL THEN
    RAISE EXCEPTION 'No staff record found for user';
  END IF;

  RETURN QUERY
  WITH active_staff AS (
    SELECT 
      s.id,
      s.name,
      s.role_id,
      r.role_name,
      s.primary_location_id as location_id,
      l.name as location_name,
      l.organization_id,
      o.name as organization_name,
      l.timezone as tz,
      l.program_start_date,
      l.cycle_length_weeks,
      ((NOW() AT TIME ZONE l.timezone)::date - 
        ((EXTRACT(ISODOW FROM NOW() AT TIME ZONE l.timezone)::int - 1) || ' days')::interval
      )::date as active_monday,
      FLOOR(EXTRACT(epoch FROM ((NOW() AT TIME ZONE l.timezone)::date - l.program_start_date::date)) / (7 * 86400) / l.cycle_length_weeks)::int + 1 as cycle_number,
      (FLOOR(EXTRACT(epoch FROM ((NOW() AT TIME ZONE l.timezone)::date - l.program_start_date::date)) / (7 * 86400)) % l.cycle_length_weeks)::int + 1 as week_in_cycle
    FROM staff s
    JOIN roles r ON r.role_id = s.role_id
    JOIN locations l ON l.id = s.primary_location_id
    JOIN organizations o ON o.id = l.organization_id
    WHERE s.is_participant = true
      AND s.primary_location_id IS NOT NULL
      AND (
        v_is_admin = true
        OR (v_scope_type = 'organization' AND l.organization_id = v_scope_id)
        OR (v_scope_type = 'location' AND s.primary_location_id = v_scope_id)
      )
  ),
  has_assignments AS (
    SELECT DISTINCT
      s.id as staff_id,
      s.role_id,
      s.location_id,
      s.active_monday,
      CASE WHEN EXISTS (
        SELECT 1 FROM weekly_assignments wa
        WHERE wa.role_id = s.role_id
          AND wa.location_id = s.location_id
          AND wa.week_start_date = s.active_monday
          AND wa.status = 'locked'
          AND (wa.superseded_at IS NULL OR wa.superseded_at > NOW())
      ) THEN 'assignments'
      ELSE 'focus'
      END as source
    FROM active_staff s
  ),
  assignments_cte AS (
    SELECT 
      ha.staff_id,
      ha.source,
      wa.id::text as assignment_id,
      wa.week_start_date as active_monday,
      wa.location_id,
      wa.role_id,
      wa.action_id,
      wa.self_select
    FROM has_assignments ha
    JOIN weekly_assignments wa ON wa.role_id = ha.role_id
      AND wa.location_id = ha.location_id
      AND wa.week_start_date = ha.active_monday
      AND wa.status = 'locked'
      AND (wa.superseded_at IS NULL OR wa.superseded_at > NOW())
    WHERE ha.source = 'assignments'

    UNION ALL

    SELECT 
      ha.staff_id,
      ha.source,
      wf.id::text as assignment_id,
      ha.active_monday,
      ha.location_id,
      wf.role_id,
      wf.action_id,
      wf.self_select
    FROM has_assignments ha
    JOIN active_staff s ON s.id = ha.staff_id
    JOIN weekly_focus wf ON wf.role_id = ha.role_id
      AND wf.cycle = s.cycle_number
      AND wf.week_in_cycle = s.week_in_cycle
      AND (wf.week_start_date IS NULL OR wf.week_start_date = ha.active_monday)
    WHERE ha.source = 'focus'
  ),
  required_count AS (
    SELECT 
      a.staff_id,
      COUNT(*) as required_count
    FROM assignments_cte a
    GROUP BY a.staff_id
  ),
  scores AS (
    SELECT
      s.id as staff_id,
      COUNT(DISTINCT CASE WHEN ws.confidence_score IS NOT NULL THEN ws.id END) as conf_count,
      COUNT(DISTINCT CASE WHEN ws.performance_score IS NOT NULL THEN ws.id END) as perf_count,
      MAX(CASE 
        WHEN ws.performance_date IS NOT NULL THEN ws.performance_date
        WHEN ws.confidence_date IS NOT NULL THEN ws.confidence_date
      END) as last_activity_at,
      CASE 
        WHEN MAX(ws.performance_date) > MAX(ws.confidence_date) OR MAX(ws.confidence_date) IS NULL THEN 'performance'
        ELSE 'confidence'
      END as last_activity_kind
    FROM active_staff s
    LEFT JOIN weekly_scores ws ON ws.staff_id = s.id
      AND ws.week_of = s.active_monday
      AND (
        ws.weekly_focus_id IN (
          SELECT a.assignment_id FROM assignments_cte a WHERE a.staff_id = s.id
        )
        OR ws.assignment_id IN (
          SELECT 'assign:' || a.assignment_id FROM assignments_cte a WHERE a.staff_id = s.id
        )
      )
    GROUP BY s.id
  ),
  backlog AS (
    SELECT
      s.id as staff_id,
      COUNT(*) as backlog_count
    FROM active_staff s
    LEFT JOIN user_backlog_v2 ub ON ub.staff_id = s.id AND ub.resolved_on IS NULL
    GROUP BY s.id
  ),
  deadlines AS (
    SELECT
      s.id as staff_id,
      s.active_monday as week_start,
      s.tz,
      (s.active_monday::timestamp AT TIME ZONE s.tz + interval '1 day' - interval '1 second')::timestamptz as checkin_due,
      (s.active_monday::timestamp AT TIME ZONE s.tz + interval '3 days' + interval '1 second')::timestamptz as checkout_open,
      (s.active_monday::timestamp AT TIME ZONE s.tz + interval '4 days' + interval '17 hours')::timestamptz as checkout_due
    FROM active_staff s
  )
  SELECT
    s.id as staff_id,
    s.name as staff_name,
    s.role_id::int,
    s.role_name,
    s.location_id,
    s.location_name,
    s.organization_id,
    s.organization_name,
    s.active_monday,
    s.cycle_number::int,
    s.week_in_cycle::int,
    CASE
      WHEN NOW() < d.checkin_due THEN 'plan'
      WHEN NOW() >= d.checkin_due AND NOW() < d.checkout_open THEN 'focus'
      ELSE 'perform'
    END as phase,
    d.checkin_due,
    d.checkout_open,
    d.checkout_due,
    COALESCE(rc.required_count, 0)::bigint as required_count,
    COALESCE(sc.conf_count, 0)::bigint as conf_count,
    COALESCE(sc.perf_count, 0)::bigint as perf_count,
    COALESCE(b.backlog_count, 0)::bigint as backlog_count,
    sc.last_activity_kind,
    sc.last_activity_at,
    COALESCE((SELECT ha.source FROM has_assignments ha WHERE ha.staff_id = s.id), 'none') as source_used,
    s.tz
  FROM active_staff s
  LEFT JOIN required_count rc ON rc.staff_id = s.id
  LEFT JOIN scores sc ON sc.staff_id = s.id
  LEFT JOIN backlog b ON b.staff_id = s.id
  LEFT JOIN deadlines d ON d.staff_id = s.id
  ORDER BY s.organization_name, s.location_name, s.name;
END;
$$;
