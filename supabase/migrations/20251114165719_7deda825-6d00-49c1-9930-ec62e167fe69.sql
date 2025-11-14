-- Fix coach dashboard week selection logic by removing "previous week adjustment"
-- This ensures the dashboard always shows current week's assignments and scores

DROP FUNCTION IF EXISTS public.get_staff_statuses(uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.get_staff_statuses(p_coach_user_id uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(staff_id uuid, staff_name text, role_id bigint, role_name text, organization_name text, location_id uuid, location_name text, assignment_monday date, cycle_number integer, week_in_cycle integer, week_label text, source text, required_count integer, conf_count integer, perf_count integer, last_activity_at timestamp with time zone, last_activity_text text, last_activity_kind text, status_state text, status_label text, status_severity text, status_detail text, deadline_at timestamp with time zone, onboarding_weeks_left integer, backlog_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
      s.role_id::bigint AS role_id,
      s.hire_date,
      s.onboarding_weeks,
      s.primary_location_id AS location_id,
      COALESCE(l.name, 'Unknown') AS location_name,
      COALESCE(l.timezone, 'America/Chicago') AS timezone,
      COALESCE(l.program_start_date, '2025-01-01'::date) AS program_start_date,
      COALESCE(l.cycle_length_weeks, 6) AS cycle_length_weeks,
      l.organization_id,
      COALESCE(o.name, 'Unknown') AS organization_name,
      COALESCE(r.role_name, 'Unknown') AS role_name
    FROM staff s
    LEFT JOIN locations l ON s.primary_location_id = l.id
    LEFT JOIN organizations o ON l.organization_id = o.id
    LEFT JOIN roles r ON s.role_id = r.role_id
    WHERE s.is_participant = true
      AND s.is_super_admin = false
      AND NOT (s.is_coach = true AND s.is_participant = false)
      AND (COALESCE(v_is_super_admin, false) OR coach_org_id IS NULL OR l.organization_id = coach_org_id)
  ),
  week_calc AS (
    SELECT
      vs.*,
      -- Canonical week calculation in location timezone
      (p_now AT TIME ZONE vs.timezone) AS now_local,
      date_trunc('week', (p_now AT TIME ZONE vs.timezone))::date AS monday_local,
      -- Program start normalized to Monday
      date_trunc('week', (vs.program_start_date AT TIME ZONE vs.timezone)::timestamp)::date AS program_monday,
      -- Friday 5pm deadline
      (date_trunc('week', (p_now AT TIME ZONE vs.timezone))::date + interval '4 days' + time '17:00') AT TIME ZONE vs.timezone AS fri_17_utc
    FROM visible_staff vs
  ),
  week_adjusted AS (
    SELECT
      wc.*,
      -- Always use current week's Monday (no adjustment)
      wc.monday_local AS assignment_monday
    FROM week_calc wc
  ),
  week_indexed AS (
    SELECT
      wa.*,
      -- Calculate week index from program start
      GREATEST(0, (wa.assignment_monday - wa.program_monday)::int / 7) AS week_index
    FROM week_adjusted wa
  ),
  week_final AS (
    SELECT
      wi.*,
      GREATEST(1, (wi.week_index / wi.cycle_length_weeks) + 1) AS cycle_number,
      GREATEST(1, (wi.week_index % wi.cycle_length_weeks) + 1) AS week_in_cycle,
      -- Compute deadlines in location timezone
      ((wi.assignment_monday + interval '1 day' + time '12:00') AT TIME ZONE wi.timezone) AS checkin_due,
      ((wi.assignment_monday + interval '3 days' + time '00:01') AT TIME ZONE wi.timezone) AS checkout_open,
      ((wi.assignment_monday + interval '4 days' + time '17:00') AT TIME ZONE wi.timezone) AS checkout_due
    FROM week_indexed wi
  ),
  source_detection AS (
    SELECT
      wf.*,
      CASE
        -- Prefer org-specific plan
        WHEN EXISTS (
          SELECT 1 FROM weekly_plan wp
          WHERE wp.role_id::bigint = wf.role_id
            AND wp.week_start_date = wf.assignment_monday
            AND wp.status = 'locked'
            AND wp.org_id = wf.organization_id
        ) THEN 'plan'
        -- Then global plan
        WHEN EXISTS (
          SELECT 1 FROM weekly_plan wp
          WHERE wp.role_id::bigint = wf.role_id
            AND wp.week_start_date = wf.assignment_monday
            AND wp.status = 'locked'
            AND wp.org_id IS NULL
        ) THEN 'plan'
        -- Then weekly_focus
        WHEN EXISTS (
          SELECT 1 FROM weekly_focus wf_check
          WHERE wf_check.role_id = wf.role_id
            AND wf_check.cycle = wf.cycle_number
            AND wf_check.week_in_cycle = wf.week_in_cycle
        ) THEN 'focus'
        ELSE 'none'
      END AS source
    FROM week_final wf
  ),
  assignments AS (
    SELECT
      sd.*,
      -- Count required assignments (excluding self_select)
      CASE sd.source
        WHEN 'plan' THEN (
          SELECT COUNT(*)::int
          FROM weekly_plan wp
          WHERE wp.role_id::bigint = sd.role_id
            AND wp.week_start_date = sd.assignment_monday
            AND wp.status = 'locked'
            AND (
              wp.org_id = sd.organization_id 
              OR (
                wp.org_id IS NULL 
                AND NOT EXISTS (
                  SELECT 1 FROM weekly_plan w2
                  WHERE w2.role_id::bigint = sd.role_id
                    AND w2.week_start_date = sd.assignment_monday
                    AND w2.status = 'locked'
                    AND w2.org_id = sd.organization_id
                )
              )
            )
            AND wp.self_select = false
        )
        WHEN 'focus' THEN (
          SELECT COUNT(*)::int
          FROM weekly_focus wf
          WHERE wf.role_id = sd.role_id
            AND wf.cycle = sd.cycle_number
            AND wf.week_in_cycle = sd.week_in_cycle
            AND wf.self_select = false
        )
        ELSE 0
      END AS required_count
    FROM source_detection sd
  ),
  scores AS (
    SELECT
      a.staff_id,
      a.staff_name,
      a.role_id,
      a.role_name,
      a.organization_name,
      a.location_id,
      a.location_name,
      a.assignment_monday,
      a.cycle_number,
      a.week_in_cycle,
      a.source,
      a.required_count,
      a.hire_date,
      a.onboarding_weeks,
      a.checkin_due,
      a.checkout_open,
      a.checkout_due,
      -- Count confidence scores
      CASE a.source
        WHEN 'plan' THEN (
          SELECT COUNT(*)::int
          FROM weekly_scores ws
          WHERE ws.staff_id = a.staff_id
            AND ws.confidence_score IS NOT NULL
            AND ws.weekly_focus_id IN (
              SELECT 'plan:' || wp.id::text
              FROM weekly_plan wp
              WHERE wp.role_id::bigint = a.role_id
                AND wp.week_start_date = a.assignment_monday
                AND wp.status = 'locked'
                AND (
                  wp.org_id = a.organization_id 
                  OR (
                    wp.org_id IS NULL 
                    AND NOT EXISTS (
                      SELECT 1 FROM weekly_plan w2
                      WHERE w2.role_id::bigint = a.role_id
                        AND w2.week_start_date = a.assignment_monday
                        AND w2.status = 'locked'
                        AND w2.org_id = a.organization_id
                    )
                  )
                )
                AND wp.self_select = false
            )
        )
        WHEN 'focus' THEN (
          SELECT COUNT(*)::int
          FROM weekly_scores ws
          JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
          WHERE ws.staff_id = a.staff_id
            AND ws.confidence_score IS NOT NULL
            AND wf.role_id = a.role_id
            AND wf.cycle = a.cycle_number
            AND wf.week_in_cycle = a.week_in_cycle
            AND wf.self_select = false
        )
        ELSE 0
      END AS conf_count,
      -- Count performance scores
      CASE a.source
        WHEN 'plan' THEN (
          SELECT COUNT(*)::int
          FROM weekly_scores ws
          WHERE ws.staff_id = a.staff_id
            AND ws.performance_score IS NOT NULL
            AND ws.weekly_focus_id IN (
              SELECT 'plan:' || wp.id::text
              FROM weekly_plan wp
              WHERE wp.role_id::bigint = a.role_id
                AND wp.week_start_date = a.assignment_monday
                AND wp.status = 'locked'
                AND (
                  wp.org_id = a.organization_id 
                  OR (
                    wp.org_id IS NULL 
                    AND NOT EXISTS (
                      SELECT 1 FROM weekly_plan w2
                      WHERE w2.role_id::bigint = a.role_id
                        AND w2.week_start_date = a.assignment_monday
                        AND w2.status = 'locked'
                        AND w2.org_id = a.organization_id
                    )
                  )
                )
                AND wp.self_select = false
            )
        )
        WHEN 'focus' THEN (
          SELECT COUNT(*)::int
          FROM weekly_scores ws
          JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
          WHERE ws.staff_id = a.staff_id
            AND ws.performance_score IS NOT NULL
            AND wf.role_id = a.role_id
            AND wf.cycle = a.cycle_number
            AND wf.week_in_cycle = a.week_in_cycle
            AND wf.self_select = false
        )
        ELSE 0
      END AS perf_count,
      -- Last activity timestamp
      (
        SELECT MAX(GREATEST(ws.confidence_date, ws.performance_date))
        FROM weekly_scores ws
        WHERE ws.staff_id = a.staff_id
      ) AS last_activity_at
    FROM assignments a
  ),
  backlog AS (
    SELECT
      ub.staff_id,
      COUNT(*)::int AS backlog_count
    FROM user_backlog_v2 ub
    WHERE ub.resolved_on IS NULL
    GROUP BY ub.staff_id
  ),
  final_state AS (
    SELECT
      s.staff_id,
      s.staff_name,
      s.role_id,
      s.role_name,
      s.organization_name,
      s.location_id,
      s.location_name,
      s.assignment_monday,
      s.cycle_number,
      s.week_in_cycle,
      'Cycle ' || s.cycle_number || ', Week ' || s.week_in_cycle AS week_label,
      s.source,
      s.required_count,
      s.conf_count,
      s.perf_count,
      s.last_activity_at,
      CASE
        WHEN s.last_activity_at IS NOT NULL THEN
          CASE
            WHEN (p_now - s.last_activity_at) < INTERVAL '1 hour' THEN 'Just now'
            WHEN (p_now - s.last_activity_at) < INTERVAL '1 day' THEN
              FLOOR(EXTRACT(epoch FROM (p_now - s.last_activity_at)) / 3600)::text || 'h ago'
            WHEN (p_now - s.last_activity_at) < INTERVAL '7 days' THEN
              FLOOR(EXTRACT(epoch FROM (p_now - s.last_activity_at)) / 86400)::text || 'd ago'
            ELSE to_char(s.last_activity_at, 'Mon DD')
          END
        ELSE 'No activity'
      END AS last_activity_text,
      CASE WHEN s.conf_count > 0 OR s.perf_count > 0 THEN 'score' ELSE 'none' END AS last_activity_kind,
      -- Compute state
      CASE
        WHEN NOT is_eligible_for_pro_moves(s.hire_date, s.onboarding_weeks, p_now::date) THEN 'onboarding'
        WHEN s.location_id IS NULL THEN 'no_location'
        WHEN s.source = 'none' OR s.required_count = 0 THEN 'no_assignments'
        WHEN p_now <= s.checkin_due AND s.conf_count < s.required_count THEN 'can_checkin'
        WHEN p_now > s.checkin_due AND p_now < s.checkout_open AND s.conf_count < s.required_count THEN 'missed_checkin'
        WHEN p_now >= s.checkout_open AND p_now <= s.checkout_due 
             AND s.conf_count >= s.required_count 
             AND s.perf_count < s.required_count THEN 'can_checkout'
        WHEN p_now > s.checkout_due AND s.perf_count < s.required_count THEN 'missed_checkout'
        WHEN s.conf_count >= s.required_count AND s.perf_count >= s.required_count THEN 'complete'
        ELSE 'partial'
      END AS status_state,
      CASE
        WHEN NOT is_eligible_for_pro_moves(s.hire_date, s.onboarding_weeks, p_now::date) THEN 'Onboarding'
        WHEN s.location_id IS NULL THEN 'No Location'
        WHEN s.source = 'none' OR s.required_count = 0 THEN 'No Assignments'
        WHEN p_now <= s.checkin_due AND s.conf_count < s.required_count THEN 'Can Check In'
        WHEN p_now > s.checkin_due AND p_now < s.checkout_open AND s.conf_count < s.required_count THEN 'Missed Check In'
        WHEN p_now >= s.checkout_open AND p_now <= s.checkout_due 
             AND s.conf_count >= s.required_count 
             AND s.perf_count < s.required_count THEN 'Can Check Out'
        WHEN p_now > s.checkout_due AND s.perf_count < s.required_count THEN 'Missed Check Out'
        WHEN s.conf_count >= s.required_count AND s.perf_count >= s.required_count THEN 'Complete'
        ELSE 'Partial'
      END AS status_label,
      CASE
        WHEN NOT is_eligible_for_pro_moves(s.hire_date, s.onboarding_weeks, p_now::date) THEN 'grey'
        WHEN s.location_id IS NULL THEN 'red'
        WHEN s.source = 'none' OR s.required_count = 0 THEN 'yellow'
        WHEN p_now > s.checkin_due AND p_now < s.checkout_open AND s.conf_count < s.required_count THEN 'yellow'
        WHEN p_now > s.checkout_due AND s.perf_count < s.required_count THEN 'red'
        WHEN s.conf_count >= s.required_count AND s.perf_count >= s.required_count THEN 'green'
        ELSE 'yellow'
      END AS status_severity,
      '' AS status_detail,
      CASE
        WHEN p_now <= s.checkin_due AND s.conf_count < s.required_count THEN s.checkin_due
        WHEN p_now >= s.checkout_open AND p_now <= s.checkout_due AND s.perf_count < s.required_count THEN s.checkout_due
        ELSE NULL
      END AS deadline_at,
      GREATEST(0, s.onboarding_weeks - ((p_now::date - s.hire_date)::int / 7))::int AS onboarding_weeks_left,
      COALESCE(b.backlog_count, 0)::int AS backlog_count
    FROM scores s
    LEFT JOIN backlog b ON b.staff_id = s.staff_id
  )
  SELECT 
    fs.staff_id,
    fs.staff_name,
    fs.role_id,
    fs.role_name,
    fs.organization_name,
    fs.location_id,
    fs.location_name,
    fs.assignment_monday,
    fs.cycle_number,
    fs.week_in_cycle,
    fs.week_label,
    fs.source,
    fs.required_count,
    fs.conf_count,
    fs.perf_count,
    fs.last_activity_at,
    fs.last_activity_text,
    fs.last_activity_kind,
    fs.status_state,
    fs.status_label,
    fs.status_severity,
    fs.status_detail,
    fs.deadline_at,
    fs.onboarding_weeks_left,
    fs.backlog_count
  FROM final_state fs
  ORDER BY
    CASE fs.status_state
      WHEN 'no_location' THEN 0
      WHEN 'no_assignments' THEN 1
      WHEN 'missed_checkout' THEN 2
      WHEN 'missed_checkin' THEN 3
      WHEN 'can_checkout' THEN 4
      WHEN 'can_checkin' THEN 5
      WHEN 'partial' THEN 6
      WHEN 'onboarding' THEN 7
      WHEN 'complete' THEN 8
      ELSE 9
    END,
    fs.staff_name;
END;
$function$;