-- Fix type casting issues in get_staff_statuses function
DROP FUNCTION IF EXISTS get_staff_statuses(uuid, timestamptz);

CREATE OR REPLACE FUNCTION get_staff_statuses(
  p_coach_user_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE(
  staff_id uuid,
  staff_name text,
  role_id integer,
  role_name text,
  organization_name text,
  location_id uuid,
  location_name text,
  status_state text,
  status_label text,
  status_severity text,
  status_detail text,
  cycle_number integer,
  week_in_cycle integer,
  week_label text,
  last_activity_at timestamptz,
  last_activity_text text,
  last_activity_kind text,
  deadline_at timestamptz,
  onboarding_weeks_left integer,
  backlog_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_super_admin boolean;
  coach_org_id uuid;
BEGIN
  -- Check if calling user is super admin
  SELECT s.is_super_admin INTO v_is_super_admin
  FROM staff s
  WHERE s.user_id = p_coach_user_id;

  -- Get coach's organization
  SELECT l.organization_id INTO coach_org_id
  FROM staff s
  LEFT JOIN locations l ON s.primary_location_id = l.id
  WHERE s.user_id = p_coach_user_id;

  RETURN QUERY
  WITH visible_staff AS (
    SELECT
      s.id AS staff_id,
      s.name AS staff_name,
      s.role_id,
      s.hire_date,
      s.onboarding_weeks,
      s.primary_location_id,
      l.name AS location_name,
      l.timezone,
      l.program_start_date,
      l.cycle_length_weeks,
      l.organization_id,
      o.name AS organization_name,
      r.role_name
    FROM staff s
    LEFT JOIN locations l ON s.primary_location_id = l.id
    LEFT JOIN organizations o ON l.organization_id = o.id
    LEFT JOIN roles r ON s.role_id = r.role_id
    WHERE s.is_participant = true
      AND s.is_super_admin = false  -- Exclude super admins
      AND NOT (s.is_coach = true AND s.is_participant = false)  -- Exclude non-participant coaches
      AND (COALESCE(v_is_super_admin, false) OR coach_org_id IS NULL OR l.organization_id = coach_org_id)
  ),
  cycle_calc AS (
    SELECT
      vs.*,
      (p_now AT TIME ZONE vs.timezone) AS local_now,
      ((p_now AT TIME ZONE vs.timezone)::date
        - ((EXTRACT(dow FROM (p_now AT TIME ZONE vs.timezone))::int + 6) % 7))::date AS monday_date,
      (vs.program_start_date
        - ((EXTRACT(dow FROM vs.program_start_date)::int + 6) % 7))::date AS program_monday,
      -- Calculate performance deadline (Friday 5pm local time)
      (((p_now AT TIME ZONE vs.timezone)::date
        - ((EXTRACT(dow FROM (p_now AT TIME ZONE vs.timezone))::int + 6) % 7))::date
        + INTERVAL '4 days' + TIME '17:00') AT TIME ZONE vs.timezone AS performance_deadline,
      -- Check if we're before the deadline
      p_now < (((p_now AT TIME ZONE vs.timezone)::date
        - ((EXTRACT(dow FROM (p_now AT TIME ZONE vs.timezone))::int + 6) % 7))::date
        + INTERVAL '4 days' + TIME '17:00') AT TIME ZONE vs.timezone AS before_deadline
    FROM visible_staff vs
  ),
  cycle_info AS (
    SELECT
      cc.*,
      GREATEST(0, (cc.monday_date - cc.program_monday))::int AS days_diff,
      FLOOR(GREATEST(0, (cc.monday_date - cc.program_monday))::int / 7.0)::int AS raw_week_index,
      -- Adjust week_index if before Friday 5pm deadline and raw_week_index > 0
      CASE 
        WHEN cc.before_deadline AND FLOOR(GREATEST(0, (cc.monday_date - cc.program_monday))::int / 7.0)::int > 0
        THEN (FLOOR(GREATEST(0, (cc.monday_date - cc.program_monday))::int / 7.0)::int - 1)::int
        ELSE FLOOR(GREATEST(0, (cc.monday_date - cc.program_monday))::int / 7.0)::int
      END AS week_index
    FROM cycle_calc cc
  ),
  cycle_final AS (
    SELECT
      ci.*,
      GREATEST(1, (ci.week_index / ci.cycle_length_weeks) + 1)::int AS cycle_number,
      GREATEST(1, (ci.week_index % ci.cycle_length_weeks) + 1)::int AS week_in_cycle,
      -- Calculate the Monday date to use for assignment lookups
      CASE 
        WHEN ci.before_deadline AND ci.raw_week_index > 0
        THEN (ci.monday_date - INTERVAL '1 week')::date
        ELSE ci.monday_date
      END AS assignment_monday
    FROM cycle_info ci
  ),
  assignments AS (
    SELECT
      cf.staff_id,
      cf.role_id,
      cf.assignment_monday,
      COALESCE(
        (SELECT COUNT(*)
         FROM weekly_plan wp
         WHERE wp.role_id = cf.role_id
           AND wp.week_start_date = cf.assignment_monday
           AND wp.status = 'locked'
           AND wp.org_id IS NULL),
        (SELECT COUNT(*)
         FROM weekly_focus wf
         WHERE wf.role_id = cf.role_id
           AND wf.cycle = cf.cycle_number
           AND wf.week_in_cycle = cf.week_in_cycle)
      )::int AS assignment_count
    FROM cycle_final cf
  ),
  scores AS (
    SELECT
      ws.staff_id,
      cf.assignment_monday,
      MAX(ws.updated_at) AS last_score_at,
      COUNT(*) FILTER (WHERE ws.confidence_score IS NOT NULL)::int AS conf_count,
      COUNT(*) FILTER (WHERE ws.performance_score IS NOT NULL)::int AS perf_count
    FROM weekly_scores ws
    INNER JOIN cycle_final cf ON ws.staff_id = cf.staff_id
    INNER JOIN weekly_focus wf ON ws.weekly_focus_id = wf.id
    WHERE wf.cycle = cf.cycle_number
      AND wf.week_in_cycle = cf.week_in_cycle
      AND wf.role_id = cf.role_id
    GROUP BY ws.staff_id, cf.assignment_monday
  ),
  backlog AS (
    SELECT
      staff_id,
      COUNT(*)::int AS backlog_count
    FROM user_backlog_v2
    WHERE resolved_on IS NULL
    GROUP BY staff_id
  ),
  activity AS (
    SELECT
      cf.staff_id,
      COALESCE(sc.last_score_at, ws.updated_at) AS last_activity_at,
      CASE
        WHEN sc.last_score_at IS NOT NULL THEN 'score'
        WHEN ws.updated_at IS NOT NULL THEN 'view'
        ELSE NULL
      END AS activity_kind
    FROM cycle_final cf
    LEFT JOIN scores sc ON cf.staff_id = sc.staff_id
    LEFT JOIN LATERAL (
      SELECT MAX(ws.updated_at) AS updated_at
      FROM weekly_scores ws
      INNER JOIN weekly_focus wf ON ws.weekly_focus_id = wf.id
      WHERE ws.staff_id = cf.staff_id
        AND wf.role_id = cf.role_id
      LIMIT 1
    ) ws ON true
  )
  SELECT
    cf.staff_id,
    cf.staff_name,
    cf.role_id,
    cf.role_name,
    cf.organization_name,
    cf.primary_location_id,
    cf.location_name,
    -- Status computation
    CASE
      WHEN cf.primary_location_id IS NULL THEN 'no_location'
      WHEN cf.week_index < cf.onboarding_weeks THEN 'onboarding'
      WHEN COALESCE(a.assignment_count, 0) = 0 THEN 'no_assignments'
      WHEN COALESCE(sc.conf_count, 0) = 0 AND COALESCE(sc.perf_count, 0) = 0 THEN 'no_activity'
      WHEN COALESCE(sc.conf_count, 0) > 0 AND COALESCE(sc.perf_count, 0) = 0 THEN 'partial'
      WHEN COALESCE(sc.conf_count, 0) = 0 AND COALESCE(sc.perf_count, 0) > 0 THEN 'partial'
      WHEN COALESCE(sc.conf_count, 0) = a.assignment_count AND COALESCE(sc.perf_count, 0) = a.assignment_count THEN 'complete'
      ELSE 'partial'
    END AS status_state,
    CASE
      WHEN cf.primary_location_id IS NULL THEN 'No Location'
      WHEN cf.week_index < cf.onboarding_weeks THEN 'Onboarding'
      WHEN COALESCE(a.assignment_count, 0) = 0 THEN 'No Assignments'
      WHEN COALESCE(sc.conf_count, 0) = 0 AND COALESCE(sc.perf_count, 0) = 0 THEN 'No Activity'
      WHEN COALESCE(sc.conf_count, 0) > 0 AND COALESCE(sc.perf_count, 0) = 0 THEN 'Partial'
      WHEN COALESCE(sc.conf_count, 0) = 0 AND COALESCE(sc.perf_count, 0) > 0 THEN 'Partial'
      WHEN COALESCE(sc.conf_count, 0) = a.assignment_count AND COALESCE(sc.perf_count, 0) = a.assignment_count THEN 'Complete'
      ELSE 'Partial'
    END AS status_label,
    CASE
      WHEN cf.primary_location_id IS NULL THEN 'red'
      WHEN cf.week_index < cf.onboarding_weeks THEN 'grey'
      WHEN COALESCE(a.assignment_count, 0) = 0 THEN 'yellow'
      WHEN COALESCE(sc.conf_count, 0) = 0 AND COALESCE(sc.perf_count, 0) = 0 THEN 'yellow'
      WHEN COALESCE(sc.conf_count, 0) = a.assignment_count AND COALESCE(sc.perf_count, 0) = a.assignment_count THEN 'green'
      ELSE 'yellow'
    END AS status_severity,
    '' AS status_detail,
    cf.cycle_number,
    cf.week_in_cycle,
    'Cycle ' || cf.cycle_number || ', Week ' || cf.week_in_cycle AS week_label,
    act.last_activity_at,
    CASE
      WHEN act.last_activity_at IS NOT NULL THEN
        CASE
          WHEN (p_now - act.last_activity_at) < INTERVAL '1 hour' THEN 'Just now'
          WHEN (p_now - act.last_activity_at) < INTERVAL '1 day' THEN
            FLOOR(EXTRACT(epoch FROM (p_now - act.last_activity_at)) / 3600)::text || 'h ago'
          WHEN (p_now - act.last_activity_at) < INTERVAL '7 days' THEN
            FLOOR(EXTRACT(epoch FROM (p_now - act.last_activity_at)) / 86400)::text || 'd ago'
          ELSE to_char(act.last_activity_at AT TIME ZONE cf.timezone, 'Mon DD')
        END
      ELSE 'No activity'
    END AS last_activity_text,
    COALESCE(act.activity_kind, 'none') AS last_activity_kind,
    cf.performance_deadline AS deadline_at,
    GREATEST(0, cf.onboarding_weeks - cf.week_index)::int AS onboarding_weeks_left,
    COALESCE(b.backlog_count, 0)::int AS backlog_count
  FROM cycle_final cf
  LEFT JOIN assignments a ON cf.staff_id = a.staff_id
  LEFT JOIN scores sc ON cf.staff_id = sc.staff_id
  LEFT JOIN backlog b ON cf.staff_id = b.staff_id
  LEFT JOIN activity act ON cf.staff_id = act.staff_id
  ORDER BY
    CASE
      WHEN cf.primary_location_id IS NULL THEN 0
      WHEN COALESCE(a.assignment_count, 0) = 0 THEN 1
      WHEN COALESCE(sc.conf_count, 0) = 0 AND COALESCE(sc.perf_count, 0) = 0 THEN 2
      WHEN COALESCE(sc.conf_count, 0) = a.assignment_count AND COALESCE(sc.perf_count, 0) = a.assignment_count THEN 4
      ELSE 3
    END,
    cf.staff_name;
END;
$$;