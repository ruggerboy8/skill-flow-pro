-- Drop old function
DROP FUNCTION IF EXISTS get_staff_statuses(uuid, timestamptz);

-- Create new get_staff_statuses with correct week alignment
CREATE FUNCTION get_staff_statuses(p_coach_user_id uuid, p_now timestamptz DEFAULT now())
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
  cycle_number int,
  week_in_cycle int,
  phase text,
  checkin_due timestamptz,
  checkout_open timestamptz,
  checkout_due timestamptz,
  required_count int,
  conf_count int,
  perf_count int,
  backlog_count int,
  last_activity_kind text,
  last_activity_at timestamptz,
  status_state text,
  is_onboarding boolean,
  week_label text,
  -- debug (remove later)
  plan_count int,
  focus_count int,
  tz text
) AS $$
WITH coach_scope AS (
  SELECT l.organization_id
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.user_id = p_coach_user_id
  LIMIT 1
),
visible_staff AS (
  SELECT s.id AS staff_id, s.name AS staff_name, s.role_id::bigint AS role_id,
         s.primary_location_id AS location_id,
         r.role_name, l.name AS location_name, l.timezone AS tz,
         l.organization_id, o.name AS organization_name,
         l.program_start_date, l.cycle_length_weeks
  FROM staff s
  JOIN roles r       ON r.role_id = s.role_id
  JOIN locations l   ON l.id = s.primary_location_id
  JOIN organizations o ON o.id = l.organization_id
  WHERE s.is_participant = TRUE
    AND l.organization_id = (SELECT organization_id FROM coach_scope)
),
week_ctx AS (
  SELECT
    vs.*,
    (p_now AT TIME ZONE vs.tz) AS local_now,
    (date_trunc('week', (p_now AT TIME ZONE vs.tz))::date) AS active_monday,
    (date_trunc('week', vs.program_start_date::timestamp AT TIME ZONE vs.tz)::date) AS program_monday,
    GREATEST(0,
      ((date_trunc('week', (p_now AT TIME ZONE vs.tz))::date)
       - (date_trunc('week', vs.program_start_date::timestamp AT TIME ZONE vs.tz)::date)) / 7
    )::int AS week_index
  FROM visible_staff vs
),
cycle_calc AS (
  SELECT
    wc.*,
    (wc.week_index / wc.cycle_length_weeks)::int + 1 AS cycle_number,
    (wc.week_index % wc.cycle_length_weeks)::int + 1 AS week_in_cycle,
    CASE WHEN (wc.week_index / wc.cycle_length_weeks)::int + 1 <= 3 THEN 'focus' ELSE 'plan' END AS phase
  FROM week_ctx wc
),
anchors AS (
  SELECT
    cc.*,
    ((cc.active_monday + 1) || ' 12:00:00 ' || cc.tz)::timestamptz AS checkin_due,
    ((cc.active_monday + 3) || ' 00:00:00 ' || cc.tz)::timestamptz AS checkout_open,
    ((cc.active_monday + 4) || ' 17:00:00 ' || cc.tz)::timestamptz AS checkout_due
  FROM cycle_calc cc
),
assignments AS (
  SELECT
    a.*,
    (SELECT COUNT(*) FROM weekly_plan wp
      WHERE wp.role_id = a.role_id::int
        AND wp.week_start_date = a.active_monday
        AND wp.status = 'locked'
        AND wp.org_id = a.organization_id) AS plan_org_count,
    (SELECT COUNT(*) FROM weekly_plan wp
      WHERE wp.role_id = a.role_id::int
        AND wp.week_start_date = a.active_monday
        AND wp.status = 'locked'
        AND wp.org_id IS NULL) AS plan_global_count,
    (SELECT COUNT(*) FROM weekly_focus wf
      WHERE wf.role_id = a.role_id
        AND wf.cycle = a.cycle_number
        AND wf.week_in_cycle = a.week_in_cycle) AS focus_count
  FROM anchors a
),
assignment_choice AS (
  SELECT
    asg.*,
    CASE
      WHEN asg.phase = 'plan' AND GREATEST(asg.plan_org_count, asg.plan_global_count) > 0 THEN 'plan'
      WHEN asg.phase = 'focus' AND asg.focus_count > 0 THEN 'focus'
      ELSE asg.phase
    END AS source
  FROM assignments asg
),
required_slots AS (
  SELECT
    ac.*,
    COALESCE((
      CASE
        WHEN ac.source = 'plan' THEN (
          SELECT jsonb_agg(jsonb_build_object(
            'id', 'plan:' || wp.id,
            'required', NOT wp.self_select
          ))
          FROM weekly_plan wp
          WHERE wp.role_id = ac.role_id::int
            AND wp.week_start_date = ac.active_monday
            AND wp.status = 'locked'
            AND ( (wp.org_id = ac.organization_id) OR
                  (wp.org_id IS NULL AND NOT EXISTS (
                      SELECT 1 FROM weekly_plan wpo
                      WHERE wpo.role_id = ac.role_id::int
                        AND wpo.week_start_date = ac.active_monday
                        AND wpo.status = 'locked'
                        AND wpo.org_id = ac.organization_id)) )
        )
        WHEN ac.source = 'focus' THEN (
          SELECT jsonb_agg(jsonb_build_object(
            'id', wf.id::text,
            'required', NOT wf.self_select
          ))
          FROM weekly_focus wf
          WHERE wf.role_id = ac.role_id
            AND wf.cycle = ac.cycle_number
            AND wf.week_in_cycle = ac.week_in_cycle
        )
      END
    ), '[]'::jsonb) AS slots
  FROM assignment_choice ac
),
counts AS (
  SELECT
    rs.*,
    COALESCE((
      SELECT COUNT(*) FROM jsonb_array_elements(rs.slots) el
      WHERE (el->>'required')::boolean = TRUE
    ),0)::int AS required_count,
    COALESCE((
      SELECT COUNT(*) FROM jsonb_array_elements(rs.slots) el
      WHERE (el->>'required')::boolean = TRUE
        AND EXISTS (
          SELECT 1 FROM weekly_scores ws
          WHERE ws.staff_id = rs.staff_id
            AND ws.weekly_focus_id = el->>'id'
            AND ws.confidence_score IS NOT NULL
        )
    ),0)::int AS conf_count,
    COALESCE((
      SELECT COUNT(*) FROM jsonb_array_elements(rs.slots) el
      WHERE (el->>'required')::boolean = TRUE
        AND EXISTS (
          SELECT 1 FROM weekly_scores ws
          WHERE ws.staff_id = rs.staff_id
            AND ws.weekly_focus_id = el->>'id'
            AND ws.performance_score IS NOT NULL
        )
    ),0)::int AS perf_count,
    (
      SELECT GREATEST(
        COALESCE(MAX(ws.confidence_date), '-infinity'),
        COALESCE(MAX(ws.performance_date), '-infinity')
      )
      FROM weekly_scores ws
      WHERE ws.staff_id = rs.staff_id
    ) AS last_activity_at_raw
  FROM required_slots rs
),
activity AS (
  SELECT
    c.*,
    CASE
      WHEN c.last_activity_at_raw IS NULL OR c.last_activity_at_raw = '-infinity'::timestamptz THEN NULL
      ELSE c.last_activity_at_raw
    END AS last_activity_at,
    CASE
      WHEN c.last_activity_at_raw IS NULL OR c.last_activity_at_raw = '-infinity'::timestamptz THEN NULL
      WHEN EXISTS (
        SELECT 1 FROM weekly_scores ws
        WHERE ws.staff_id = c.staff_id
          AND ws.performance_date = c.last_activity_at_raw
      ) THEN 'performance'
      ELSE 'confidence'
    END AS last_activity_kind
  FROM counts c
),
backlog AS (
  SELECT
    a.staff_id,
    COUNT(ub.id)::int AS backlog_count
  FROM activity a
  LEFT JOIN user_backlog_v2 ub ON ub.staff_id = a.staff_id AND ub.resolved_on IS NULL
  GROUP BY a.staff_id
),
state_calc AS (
  SELECT
    a.*,
    b.backlog_count,
    CASE
      WHEN a.required_count = 0 THEN 'no_assignments'
      WHEN a.conf_count >= a.required_count AND a.perf_count >= a.required_count THEN 'done'
      WHEN p_now <= a.checkin_due AND a.conf_count < a.required_count THEN 'can_checkin'
      WHEN p_now >  a.checkin_due AND p_now <  a.checkout_open AND a.conf_count < a.required_count THEN 'missed_checkin'
      WHEN a.conf_count >= a.required_count AND p_now < a.checkout_open THEN 'wait_for_thu'
      WHEN p_now >= a.checkout_open AND p_now <= a.checkout_due AND a.conf_count >= a.required_count AND a.perf_count < a.required_count THEN 'can_checkout'
      WHEN p_now >  a.checkout_due AND a.perf_count < a.required_count THEN 'missed_checkout'
      ELSE 'no_assignments'
    END AS status_state,
    (a.cycle_number <= 3) AS is_onboarding,
    ('Week of ' || a.active_monday::text) AS week_label
  FROM activity a
  JOIN backlog b USING (staff_id)
)
SELECT
  staff_id, staff_name, role_id, role_name, location_id, location_name,
  organization_id, organization_name,
  active_monday, cycle_number, week_in_cycle, phase,
  checkin_due, checkout_open, checkout_due,
  required_count, conf_count, perf_count, backlog_count,
  last_activity_kind, last_activity_at,
  status_state, is_onboarding, week_label,
  plan_org_count + plan_global_count AS plan_count,
  focus_count,
  tz
FROM state_calc
ORDER BY
  CASE status_state
    WHEN 'missed_checkin'  THEN 0
    WHEN 'missed_checkout' THEN 0
    WHEN 'can_checkin'     THEN 1
    WHEN 'can_checkout'    THEN 1
    ELSE 2
  END,
  staff_name;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public';