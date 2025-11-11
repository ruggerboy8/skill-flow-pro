-- Update get_staff_statuses to provide more specific last activity and status details
DROP FUNCTION IF EXISTS public.get_staff_statuses(uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.get_staff_statuses(
  p_coach_user_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  role_id bigint,
  role_name text,
  location_id uuid,
  location_name text,
  organization_name text,
  status_state text,
  status_label text,
  status_detail text,
  status_severity text,
  backlog_count bigint,
  last_activity_at timestamptz,
  last_activity_kind text,
  last_activity_text text,
  deadline_at timestamptz,
  week_label text,
  cycle_number integer,
  week_in_cycle integer,
  onboarding_weeks_left integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  coach_org_id uuid;
  v_is_super_admin boolean;
BEGIN
  SELECT s.is_super_admin INTO v_is_super_admin
  FROM staff s
  WHERE s.user_id = p_coach_user_id
  LIMIT 1;

  IF NOT COALESCE(v_is_super_admin, false) THEN
    SELECT l.organization_id INTO coach_org_id
    FROM staff s
    JOIN locations l ON l.id = s.primary_location_id
    WHERE s.user_id = p_coach_user_id
    LIMIT 1;
  END IF;

  RETURN QUERY
  WITH visible_staff AS (
    SELECT
      s.id AS staff_id,
      s.name AS staff_name,
      s.role_id,
      r.role_name,
      s.hire_date,
      COALESCE(s.onboarding_weeks, 0) AS onboarding_weeks,
      l.id AS location_id,
      l.name AS location_name,
      l.timezone,
      l.program_start_date::date AS program_start_date,
      COALESCE(l.cycle_length_weeks, 3) AS cycle_length_weeks,
      l.organization_id,
      o.name AS organization_name
    FROM staff s
    JOIN locations l ON l.id = s.primary_location_id
    LEFT JOIN roles r ON r.role_id = s.role_id
    LEFT JOIN organizations o ON o.id = l.organization_id
    WHERE s.is_participant = true
      AND (COALESCE(v_is_super_admin, false) OR coach_org_id IS NULL OR l.organization_id = coach_org_id)
  ),
  cycle_calc AS (
    SELECT
      vs.*,
      (p_now AT TIME ZONE vs.timezone) AS local_now,
      ((p_now AT TIME ZONE vs.timezone)::date
        - ((EXTRACT(dow FROM (p_now AT TIME ZONE vs.timezone))::int + 6) % 7))::date AS monday_date,
      (vs.program_start_date
        - ((EXTRACT(dow FROM vs.program_start_date)::int + 6) % 7))::date AS program_monday
    FROM visible_staff vs
  ),
  cycle_info AS (
    SELECT
      cc.*,
      GREATEST(0, (cc.monday_date - cc.program_monday))::int AS days_diff,
      FLOOR(GREATEST(0, (cc.monday_date - cc.program_monday))::int / 7.0)::int AS week_index,
      GREATEST(1, FLOOR(GREATEST(0, (cc.monday_date - cc.program_monday))::int / 7.0)::int / cc.cycle_length_weeks + 1)::int AS cycle_number,
      GREATEST(1, (FLOOR(GREATEST(0, (cc.monday_date - cc.program_monday))::int / 7.0)::int % cc.cycle_length_weeks) + 1)::int AS week_in_cycle
    FROM cycle_calc cc
  ),
  assignments AS (
    SELECT
      ci.*,
      COALESCE(
        CASE WHEN ci.cycle_number >= 4 THEN (
          SELECT jsonb_agg(jsonb_build_object(
                   'id', ('plan:' || wp.id)::text,
                   'required', (NOT wp.self_select)
                 ) ORDER BY wp.display_order)
          FROM weekly_plan wp
          WHERE wp.role_id = ci.role_id
            AND wp.week_start_date = ci.monday_date
            AND wp.status = 'locked'
            AND (
              (EXISTS (SELECT 1 FROM weekly_plan wpx
                       WHERE wpx.role_id = ci.role_id
                         AND wpx.week_start_date = ci.monday_date
                         AND wpx.status = 'locked'
                         AND wpx.org_id = ci.organization_id)
               AND wp.org_id = ci.organization_id)
              OR
              (NOT EXISTS (SELECT 1 FROM weekly_plan wpg
                           WHERE wpg.role_id = ci.role_id
                             AND wpg.week_start_date = ci.monday_date
                             AND wpg.status = 'locked'
                             AND wpg.org_id = ci.organization_id)
               AND wp.org_id IS NULL)
            )
        ) END,
        CASE WHEN ci.cycle_number < 4 THEN (
          SELECT jsonb_agg(jsonb_build_object(
                   'id', wf.id::text,
                   'required', (NOT wf.self_select)
                 ) ORDER BY wf.display_order)
          FROM weekly_focus wf
          WHERE wf.role_id = ci.role_id
            AND wf.cycle = ci.cycle_number
            AND wf.week_in_cycle = ci.week_in_cycle
        ) END
      ) AS assignments_json
    FROM cycle_info ci
  ),
  enriched AS (
    SELECT
      a.*,
      COALESCE((SELECT count(*) FROM jsonb_array_elements(a.assignments_json) e WHERE (e->>'required')::boolean), 0) AS required_count,
      COALESCE((SELECT array_agg(e->>'id')
                FROM jsonb_array_elements(a.assignments_json) e
                WHERE (e->>'required')::boolean), array[]::text[]) AS required_ids
    FROM assignments a
  ),
  scores AS (
    SELECT
      e.*,
      COALESCE((SELECT count(*) FROM weekly_scores ws
                WHERE ws.staff_id = e.staff_id
                  AND ws.weekly_focus_id = ANY(e.required_ids)
                  AND ws.confidence_score IS NOT NULL), 0) AS conf_count,
      COALESCE((SELECT count(*) FROM weekly_scores ws
                WHERE ws.staff_id = e.staff_id
                  AND ws.weekly_focus_id = ANY(e.required_ids)
                  AND ws.performance_score IS NOT NULL), 0) AS perf_count,
      (SELECT MAX(ws.confidence_date)
       FROM weekly_scores ws
       WHERE ws.staff_id = e.staff_id
         AND ws.weekly_focus_id = ANY(e.required_ids)
         AND ws.confidence_score IS NOT NULL) AS last_conf_at,
      (SELECT MAX(ws.performance_date)
       FROM weekly_scores ws
       WHERE ws.staff_id = e.staff_id
         AND ws.weekly_focus_id = ANY(e.required_ids)
         AND ws.performance_score IS NOT NULL) AS last_perf_at
    FROM enriched e
  ),
  backlog AS (
    SELECT
      s.*,
      (SELECT count(*) FROM user_backlog_v2 ub
       WHERE ub.staff_id = s.staff_id AND ub.resolved_on IS NULL) AS backlog_count
    FROM scores s
  ),
  anchors AS (
    SELECT
      b.*,
      ((b.monday_date + INTERVAL '1 day') + TIME '12:00') AT TIME ZONE b.timezone AS checkin_due,
      ((b.monday_date + INTERVAL '3 days') + TIME '00:00') AT TIME ZONE b.timezone AS checkout_open,
      ((b.monday_date + INTERVAL '4 days') + TIME '17:00') AT TIME ZONE b.timezone AS checkout_due
    FROM backlog b
  ),
  states AS (
    SELECT
      a.*,
      CASE
        WHEN a.hire_date IS NOT NULL
             AND p_now < (a.hire_date + (a.onboarding_weeks::text || ' weeks')::interval) THEN 'onboarding'
        WHEN a.required_count = 0 THEN 'no_assignments'
        WHEN a.conf_count >= a.required_count AND a.perf_count >= a.required_count THEN 'done'
        WHEN p_now <= a.checkin_due AND a.conf_count < a.required_count THEN 'can_checkin'
        WHEN p_now > a.checkin_due AND p_now < a.checkout_open AND a.conf_count < a.required_count THEN 'missed_checkin'
        WHEN p_now >= a.checkout_open AND p_now <= a.checkout_due
             AND a.conf_count >= a.required_count AND a.perf_count < a.required_count THEN 'can_checkout'
        WHEN p_now > a.checkout_due AND a.perf_count < a.required_count THEN 'missed_checkout'
        WHEN a.conf_count >= a.required_count AND p_now < a.checkout_open THEN 'wait_for_thu'
        ELSE 'no_assignments'
      END AS status_state_calc,
      CASE
        WHEN a.conf_count < a.required_count AND p_now <= a.checkout_open THEN a.checkin_due
        WHEN a.conf_count >= a.required_count AND a.perf_count < a.required_count THEN a.checkout_due
        ELSE NULL
      END AS deadline_calc,
      CASE WHEN a.cycle_number >= 4
           THEN 'Week of ' || to_char(a.monday_date, 'YYYY-MM-DD')
           ELSE 'Cycle ' || a.cycle_number::text || ', Week ' || a.week_in_cycle::text
      END AS week_label_calc,
      CASE
        WHEN a.last_conf_at IS NOT NULL AND a.last_perf_at IS NOT NULL THEN
          CASE WHEN a.last_conf_at > a.last_perf_at THEN 'confidence' ELSE 'performance' END
        WHEN a.last_conf_at IS NOT NULL THEN 'confidence'
        WHEN a.last_perf_at IS NOT NULL THEN 'performance'
        ELSE NULL
      END AS last_activity_kind_calc,
      CASE
        WHEN a.last_conf_at IS NOT NULL AND a.last_perf_at IS NOT NULL THEN
          GREATEST(a.last_conf_at, a.last_perf_at)
        WHEN a.last_conf_at IS NOT NULL THEN a.last_conf_at
        WHEN a.last_perf_at IS NOT NULL THEN a.last_perf_at
        ELSE NULL
      END AS last_activity_timestamp,
      CASE
        WHEN a.hire_date IS NOT NULL AND p_now < (a.hire_date + (a.onboarding_weeks::text || ' weeks')::interval) 
          THEN CEIL(EXTRACT(EPOCH FROM ((a.hire_date + (a.onboarding_weeks::text || ' weeks')::interval) - p_now)) / 604800)::int
        ELSE 0
      END AS onboarding_weeks_left_calc
    FROM anchors a
  )
  SELECT
    states.staff_id,
    states.staff_name,
    states.role_id,
    states.role_name,
    states.location_id,
    states.location_name,
    states.organization_name,
    states.status_state_calc AS status_state,
    CASE states.status_state_calc
      WHEN 'onboarding' THEN 'In Onboarding'
      WHEN 'can_checkin' THEN 'Missing Confidence'
      WHEN 'missed_checkin' THEN 'Missing Confidence'
      WHEN 'wait_for_thu' THEN 'Waiting for Thursday'
      WHEN 'can_checkout' THEN 'Missing Performance'
      WHEN 'missed_checkout' THEN 'Missing Performance'
      WHEN 'done' THEN 'Complete'
      WHEN 'no_assignments' THEN 'No Assignments'
      ELSE 'Unknown'
    END AS status_label,
    CASE states.status_state_calc
      WHEN 'onboarding' THEN 'Currently in onboarding period'
      WHEN 'can_checkin' THEN 'Confidence scores due by ' || to_char(states.deadline_calc AT TIME ZONE states.timezone, 'Dy Mon DD at HH12:MI AM')
      WHEN 'missed_checkin' THEN 'Confidence deadline passed on ' || to_char(states.checkin_due AT TIME ZONE states.timezone, 'Dy Mon DD at HH12:MI AM')
      WHEN 'wait_for_thu' THEN 'Performance window opens Thursday'
      WHEN 'can_checkout' THEN 'Performance scores due by ' || to_char(states.deadline_calc AT TIME ZONE states.timezone, 'Dy Mon DD at HH12:MI AM')
      WHEN 'missed_checkout' THEN 'Performance deadline passed on ' || to_char(states.checkout_due AT TIME ZONE states.timezone, 'Dy Mon DD at HH12:MI AM')
      WHEN 'done' THEN 'All scores submitted for this week'
      WHEN 'no_assignments' THEN 'No assignments for this week'
      ELSE ''
    END AS status_detail,
    CASE states.status_state_calc
      WHEN 'missed_checkin' THEN 'red'
      WHEN 'missed_checkout' THEN 'red'
      WHEN 'can_checkin' THEN 'yellow'
      WHEN 'can_checkout' THEN 'yellow'
      WHEN 'done' THEN 'green'
      ELSE 'grey'
    END AS status_severity,
    states.backlog_count,
    states.last_activity_timestamp AS last_activity_at,
    states.last_activity_kind_calc AS last_activity_kind,
    CASE
      WHEN states.last_activity_timestamp IS NOT NULL THEN 
        CASE states.last_activity_kind_calc
          WHEN 'confidence' THEN 'Confidence submitted ' || to_char(states.last_activity_timestamp AT TIME ZONE states.timezone, 'Mon DD') || ' @ ' || to_char(states.last_activity_timestamp AT TIME ZONE states.timezone, 'HH12:MI AM')
          WHEN 'performance' THEN 'Performance submitted ' || to_char(states.last_activity_timestamp AT TIME ZONE states.timezone, 'Mon DD') || ' @ ' || to_char(states.last_activity_timestamp AT TIME ZONE states.timezone, 'HH12:MI AM')
          ELSE 'Activity ' || to_char(states.last_activity_timestamp AT TIME ZONE states.timezone, 'Mon DD') || ' @ ' || to_char(states.last_activity_timestamp AT TIME ZONE states.timezone, 'HH12:MI AM')
        END
      ELSE 'No activity this week'
    END AS last_activity_text,
    states.deadline_calc AS deadline_at,
    states.week_label_calc AS week_label,
    states.cycle_number,
    states.week_in_cycle,
    states.onboarding_weeks_left_calc AS onboarding_weeks_left
  FROM states
  ORDER BY
    CASE status_state_calc
      WHEN 'missed_checkin' THEN 0
      WHEN 'missed_checkout' THEN 0
      WHEN 'can_checkin' THEN 1
      WHEN 'can_checkout' THEN 1
      WHEN 'wait_for_thu' THEN 2
      WHEN 'no_assignments' THEN 3
      WHEN 'onboarding' THEN 4
      ELSE 5
    END,
    staff_name;
END;
$$;

ALTER FUNCTION public.get_staff_statuses(uuid, timestamptz) SET search_path = public;
GRANT EXECUTE ON FUNCTION public.get_staff_statuses(uuid, timestamptz) TO authenticated;