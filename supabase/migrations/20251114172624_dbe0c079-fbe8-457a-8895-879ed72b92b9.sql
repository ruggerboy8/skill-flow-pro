-- Fix program_monday calculation bug causing off-by-one week error
-- Line 60: Remove AT TIME ZONE conversion that shifts dates backward

DROP FUNCTION IF EXISTS public.get_staff_statuses(uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.get_staff_statuses(p_coach_user_id uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(staff_id uuid, staff_name text, role_id bigint, role_name text, organization_name text, location_id uuid, location_name text, assignment_monday date, cycle_number integer, week_in_cycle integer, week_label text, source text, required_count integer, conf_count integer, perf_count integer, last_activity_at timestamp with time zone, last_activity_text text, last_activity_kind text, status_state text, status_label text, status_severity text, status_detail text, deadline_at timestamp with time zone, onboarding_weeks_left integer, backlog_count integer)
 LANGUAGE plpgsql SECURITY DEFINER
AS $function$
DECLARE
  v_is_super_admin boolean;
  coach_org_id uuid;
BEGIN
  SELECT s.is_super_admin INTO v_is_super_admin FROM staff s WHERE s.user_id = p_coach_user_id;
  SELECT l.organization_id INTO coach_org_id FROM staff s LEFT JOIN locations l ON s.primary_location_id = l.id WHERE s.user_id = p_coach_user_id;

  RETURN QUERY
  WITH visible_staff AS (
    SELECT s.id AS staff_id, s.name AS staff_name, s.role_id::bigint AS role_id, s.hire_date, s.onboarding_weeks, s.primary_location_id AS location_id,
      COALESCE(l.name, 'Unknown') AS location_name, COALESCE(l.timezone, 'America/Chicago') AS timezone,
      COALESCE(l.program_start_date, '2025-01-01'::date) AS program_start_date, COALESCE(l.cycle_length_weeks, 6) AS cycle_length_weeks,
      l.organization_id, COALESCE(o.name, 'Unknown') AS organization_name, COALESCE(r.role_name, 'Unknown') AS role_name
    FROM staff s LEFT JOIN locations l ON s.primary_location_id = l.id LEFT JOIN organizations o ON l.organization_id = o.id LEFT JOIN roles r ON s.role_id = r.role_id
    WHERE s.is_participant = true AND s.is_super_admin = false AND NOT (s.is_coach = true AND s.is_participant = false)
      AND (COALESCE(v_is_super_admin, false) OR coach_org_id IS NULL OR l.organization_id = coach_org_id)
  ),
  week_calc AS (
    SELECT vs.*, (p_now AT TIME ZONE vs.timezone) AS now_local,
      date_trunc('week', (p_now AT TIME ZONE vs.timezone))::date AS monday_local,
      date_trunc('week', vs.program_start_date::timestamp)::date AS program_monday,
      (date_trunc('week', (p_now AT TIME ZONE vs.timezone))::date + interval '4 days' + time '17:00') AT TIME ZONE vs.timezone AS fri_17_utc
    FROM visible_staff vs
  ),
  week_adjusted AS (SELECT wc.*, wc.monday_local AS assignment_monday FROM week_calc wc),
  week_indexed AS (SELECT wa.*, GREATEST(0, (wa.assignment_monday - wa.program_monday)::int / 7) AS week_index FROM week_adjusted wa),
  week_final AS (
    SELECT wi.*, GREATEST(1, (wi.week_index / wi.cycle_length_weeks) + 1) AS cycle_number, GREATEST(1, (wi.week_index % wi.cycle_length_weeks) + 1) AS week_in_cycle,
      ((wi.assignment_monday + interval '1 day' + time '12:00') AT TIME ZONE wi.timezone) AS checkin_due,
      ((wi.assignment_monday + interval '3 days' + time '00:01') AT TIME ZONE wi.timezone) AS checkout_open,
      ((wi.assignment_monday + interval '4 days' + time '17:00') AT TIME ZONE wi.timezone) AS checkout_due
    FROM week_indexed wi
  ),
  source_detection AS (
    SELECT wf.*,
      CASE WHEN EXISTS (SELECT 1 FROM weekly_plan wp WHERE wp.role_id = wf.role_id AND wp.week_start_date = wf.assignment_monday AND wp.status = 'locked' AND wp.org_id = wf.organization_id) THEN 'plan'
           WHEN EXISTS (SELECT 1 FROM weekly_plan wp WHERE wp.role_id = wf.role_id AND wp.week_start_date = wf.assignment_monday AND wp.status = 'locked' AND wp.org_id IS NULL) THEN 'plan'
           WHEN EXISTS (SELECT 1 FROM weekly_focus f WHERE f.role_id = wf.role_id AND f.cycle = wf.cycle_number AND f.week_in_cycle = wf.week_in_cycle) THEN 'focus'
           ELSE 'none' END AS source,
      CASE WHEN EXISTS (SELECT 1 FROM weekly_plan wp WHERE wp.role_id = wf.role_id AND wp.week_start_date = wf.assignment_monday AND wp.status = 'locked' AND (wp.org_id = wf.organization_id OR wp.org_id IS NULL))
           THEN (SELECT COUNT(*) FROM weekly_plan wp2 WHERE wp2.role_id = wf.role_id AND wp2.week_start_date = wf.assignment_monday AND wp2.status = 'locked' 
                 AND (wp2.org_id = wf.organization_id OR (wp2.org_id IS NULL AND NOT EXISTS (SELECT 1 FROM weekly_plan wp3 WHERE wp3.role_id = wf.role_id AND wp3.week_start_date = wf.assignment_monday AND wp3.status = 'locked' AND wp3.org_id = wf.organization_id))))::int
           WHEN EXISTS (SELECT 1 FROM weekly_focus f WHERE f.role_id = wf.role_id AND f.cycle = wf.cycle_number AND f.week_in_cycle = wf.week_in_cycle)
           THEN (SELECT COUNT(*) FROM weekly_focus f2 WHERE f2.role_id = wf.role_id AND f2.cycle = wf.cycle_number AND f2.week_in_cycle = wf.week_in_cycle AND f2.self_select = false)::int
           ELSE 0 END AS required_count
    FROM week_final wf
  ),
  with_scores AS (
    SELECT sd.*, COUNT(DISTINCT ws.id) FILTER (WHERE ws.confidence_score IS NOT NULL) AS conf_count, COUNT(DISTINCT ws.id) FILTER (WHERE ws.performance_score IS NOT NULL) AS perf_count,
      MAX(GREATEST(ws.confidence_date, ws.performance_date)) AS last_activity_at
    FROM source_detection sd LEFT JOIN weekly_scores ws ON ws.staff_id = sd.staff_id
      AND ((sd.source = 'focus' AND ws.weekly_focus_id IN (SELECT wf.id::text FROM weekly_focus wf WHERE wf.cycle = sd.cycle_number AND wf.week_in_cycle = sd.week_in_cycle AND wf.role_id = sd.role_id))
        OR (sd.source = 'plan' AND ws.weekly_focus_id IN (SELECT wp.id::text FROM weekly_plan wp WHERE wp.week_start_date = sd.assignment_monday AND wp.role_id = sd.role_id AND wp.status = 'locked' 
            AND (wp.org_id = sd.organization_id OR (wp.org_id IS NULL AND NOT EXISTS (SELECT 1 FROM weekly_plan wp2 WHERE wp2.role_id = sd.role_id AND wp2.week_start_date = sd.assignment_monday AND wp2.status = 'locked' AND wp2.org_id = sd.organization_id))))))
    GROUP BY sd.staff_id, sd.staff_name, sd.role_id, sd.role_name, sd.organization_name, sd.location_id, sd.location_name, sd.timezone, sd.program_start_date, sd.cycle_length_weeks, sd.organization_id, sd.hire_date, sd.onboarding_weeks,
      sd.now_local, sd.monday_local, sd.program_monday, sd.fri_17_utc, sd.assignment_monday, sd.week_index, sd.cycle_number, sd.week_in_cycle, sd.checkin_due, sd.checkout_open, sd.checkout_due, sd.source, sd.required_count
  ),
  with_backlog AS (SELECT ws.*, COALESCE((SELECT COUNT(*)::int FROM user_backlog_v2 ub WHERE ub.staff_id = ws.staff_id AND ub.resolved_on IS NULL), 0) AS backlog_count FROM with_scores ws),
  final_state AS (
    SELECT wb.*,
      CASE WHEN wb.location_id IS NULL THEN 'no_location' WHEN wb.hire_date IS NOT NULL AND wb.hire_date + (wb.onboarding_weeks || ' weeks')::interval > p_now THEN 'onboarding'
           WHEN wb.source = 'none' OR wb.required_count = 0 THEN 'no_assignments' WHEN p_now <= wb.checkin_due AND wb.conf_count < wb.required_count THEN 'can_checkin'
           WHEN p_now > wb.checkin_due AND p_now < wb.checkout_open AND wb.conf_count < wb.required_count THEN 'missed_checkin'
           WHEN p_now >= wb.checkout_open AND p_now <= wb.checkout_due AND wb.conf_count >= wb.required_count AND wb.perf_count < wb.required_count THEN 'can_checkout'
           WHEN p_now > wb.checkout_due AND wb.perf_count < wb.required_count THEN 'missed_checkout' WHEN wb.conf_count >= wb.required_count AND wb.perf_count >= wb.required_count THEN 'complete'
           ELSE 'partial' END AS status_state,
      CASE WHEN p_now <= wb.checkin_due THEN wb.checkin_due ELSE wb.checkout_due END AS deadline_at,
      CASE WHEN wb.hire_date IS NOT NULL AND wb.hire_date + (wb.onboarding_weeks || ' weeks')::interval > p_now
           THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (wb.hire_date + (wb.onboarding_weeks || ' weeks')::interval - p_now)) / 604800)::int) ELSE 0 END AS onboarding_weeks_left
    FROM with_backlog wb
  )
  SELECT fs.staff_id, fs.staff_name, fs.role_id, fs.role_name, fs.organization_name, fs.location_id, fs.location_name, fs.assignment_monday, fs.cycle_number, fs.week_in_cycle,
    'Cycle ' || fs.cycle_number || ', Week ' || fs.week_in_cycle AS week_label, fs.source, fs.required_count, fs.conf_count, fs.perf_count, fs.last_activity_at,
    CASE WHEN fs.last_activity_at IS NULL THEN '' WHEN fs.last_activity_at > p_now - interval '1 hour' THEN EXTRACT(EPOCH FROM (p_now - fs.last_activity_at))::int / 60 || 'm ago'
         WHEN fs.last_activity_at > p_now - interval '24 hours' THEN EXTRACT(EPOCH FROM (p_now - fs.last_activity_at))::int / 3600 || 'h ago'
         WHEN fs.last_activity_at > p_now - interval '7 days' THEN EXTRACT(EPOCH FROM (p_now - fs.last_activity_at))::int / 86400 || 'd ago'
         ELSE to_char(fs.last_activity_at AT TIME ZONE fs.timezone, 'Mon DD') END AS last_activity_text,
    CASE WHEN fs.conf_count > 0 AND fs.perf_count > 0 THEN 'both' WHEN fs.conf_count > 0 THEN 'score' WHEN fs.perf_count > 0 THEN 'score' ELSE 'none' END AS last_activity_kind,
    fs.status_state,
    CASE WHEN fs.status_state = 'onboarding' THEN 'Onboarding' WHEN fs.status_state = 'no_location' THEN 'No Location' WHEN fs.status_state = 'no_assignments' THEN 'No Assignments'
         WHEN fs.status_state = 'can_checkin' THEN 'Can Check In' WHEN fs.status_state = 'missed_checkin' THEN 'Missed Check In' WHEN fs.status_state = 'can_checkout' THEN 'Can Check Out'
         WHEN fs.status_state = 'missed_checkout' THEN 'Missed Check Out' WHEN fs.status_state = 'complete' THEN 'Complete' ELSE 'Partial' END AS status_label,
    CASE WHEN fs.status_state IN ('missed_checkin', 'missed_checkout') THEN 'red' WHEN fs.status_state IN ('can_checkin', 'can_checkout', 'partial') THEN 'yellow'
         WHEN fs.status_state = 'complete' THEN 'green' ELSE 'grey' END AS status_severity,
    '' AS status_detail, fs.deadline_at, fs.onboarding_weeks_left, fs.backlog_count
  FROM final_state fs ORDER BY CASE WHEN fs.status_state IN ('missed_checkin', 'missed_checkout') THEN 1 WHEN fs.status_state IN ('can_checkin', 'can_checkout', 'partial') THEN 2 WHEN fs.status_state = 'complete' THEN 3 ELSE 4 END, fs.staff_name;
END;
$function$;

ALTER FUNCTION public.get_staff_statuses(uuid, timestamptz) SET search_path = public;
GRANT EXECUTE ON FUNCTION public.get_staff_statuses(uuid, timestamptz) TO authenticated;