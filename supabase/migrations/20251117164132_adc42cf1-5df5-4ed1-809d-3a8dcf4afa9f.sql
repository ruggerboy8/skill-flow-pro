
-- Update get_staff_statuses to use cycle/week matching for weekly_focus, week_of only for weekly_plan
DROP FUNCTION IF EXISTS get_staff_statuses(uuid, timestamptz);

CREATE OR REPLACE FUNCTION get_staff_statuses(
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
  source_used text,
  tz text
) AS $$
WITH coach_info AS (
  SELECT 
    s.is_super_admin,
    l.organization_id
  FROM staff s
  LEFT JOIN locations l ON l.id = s.primary_location_id
  WHERE s.user_id = p_coach_user_id
),
visible_staff AS (
  SELECT 
    s.id AS staff_id, 
    s.name AS staff_name, 
    s.role_id::bigint AS role_id,
    s.primary_location_id AS location_id,
    r.role_name, 
    l.name AS location_name, 
    l.timezone AS tz,
    l.organization_id, 
    o.name AS organization_name,
    l.program_start_date, 
    l.cycle_length_weeks
  FROM staff s
  JOIN roles r ON r.role_id = s.role_id
  JOIN locations l ON l.id = s.primary_location_id
  JOIN organizations o ON o.id = l.organization_id
  CROSS JOIN coach_info ci
  WHERE s.is_participant = TRUE
    AND (ci.is_super_admin OR l.organization_id = ci.organization_id)
),
week_ctx AS (
  SELECT
    vs.*,
    (date_trunc('week', (p_now AT TIME ZONE vs.tz))::date) AS active_monday,
    GREATEST(0,
      ((date_trunc('week', (p_now AT TIME ZONE vs.tz))::date)
       - (date_trunc('week', vs.program_start_date::timestamp AT TIME ZONE vs.tz)::date)) / 7
    )::int AS week_index
  FROM visible_staff vs
),
cycle_calc AS (
  SELECT
    wc.*,
    CASE 
      WHEN wc.week_index = 0 THEN 1
      ELSE ((wc.week_index - 1) / wc.cycle_length_weeks)::int + 1
    END AS cycle_number,
    CASE 
      WHEN wc.week_index = 0 THEN 1
      ELSE ((wc.week_index - 1) % wc.cycle_length_weeks)::int + 1
    END AS week_in_cycle,
    CASE 
      WHEN wc.week_index = 0 THEN 'focus'
      WHEN ((wc.week_index - 1) / wc.cycle_length_weeks)::int + 1 <= 3 THEN 'focus' 
      ELSE 'plan' 
    END AS phase
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
source_choice AS (
  SELECT
    a.*,
    CASE
      WHEN a.cycle_number >= 4 THEN 'plan'
      ELSE 'focus'
    END AS source_used
  FROM anchors a
),
assignments AS (
  SELECT
    sc.*,
    CASE
      WHEN sc.source_used = 'plan' THEN (
        SELECT COUNT(*)::int
        FROM weekly_plan wp
        WHERE wp.role_id = sc.role_id::int
          AND wp.week_start_date = sc.active_monday
          AND wp.status = 'locked'
          AND wp.self_select = false
          AND (wp.org_id = sc.organization_id OR 
               (wp.org_id IS NULL AND NOT EXISTS (
                 SELECT 1 FROM weekly_plan wpo
                 WHERE wpo.role_id = sc.role_id::int
                   AND wpo.week_start_date = sc.active_monday
                   AND wpo.status = 'locked'
                   AND wpo.org_id = sc.organization_id
               )))
      )
      ELSE (
        SELECT COUNT(*)::int
        FROM weekly_focus wf
        WHERE wf.role_id = sc.role_id
          AND wf.cycle = sc.cycle_number
          AND wf.week_in_cycle = sc.week_in_cycle
          AND wf.self_select = false
      )
    END AS required_count
  FROM source_choice sc
),
scores AS (
  SELECT
    a.*,
    -- For weekly_focus, match by cycle/week; for weekly_plan, use week_of
    (
      SELECT COUNT(*)::int
      FROM weekly_scores ws
      LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
      WHERE ws.staff_id = a.staff_id
        AND ws.confidence_score IS NOT NULL
        AND (
          -- For weekly_focus-based scores, match by cycle/week
          (wf.id IS NOT NULL AND wf.cycle = a.cycle_number AND wf.week_in_cycle = a.week_in_cycle)
          -- For weekly_plan-based scores, match by week_of date
          OR (wf.id IS NULL AND ws.week_of = a.active_monday)
        )
    ) AS conf_count,
    (
      SELECT COUNT(*)::int
      FROM weekly_scores ws
      LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
      WHERE ws.staff_id = a.staff_id
        AND ws.performance_score IS NOT NULL
        AND (
          (wf.id IS NOT NULL AND wf.cycle = a.cycle_number AND wf.week_in_cycle = a.week_in_cycle)
          OR (wf.id IS NULL AND ws.week_of = a.active_monday)
        )
    ) AS perf_count,
    (
      SELECT CASE 
        WHEN ws.performance_score IS NOT NULL THEN 'performance'
        WHEN ws.confidence_score IS NOT NULL THEN 'confidence'
        ELSE NULL
      END
      FROM weekly_scores ws
      LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
      WHERE ws.staff_id = a.staff_id
        AND (
          (wf.id IS NOT NULL AND wf.cycle = a.cycle_number AND wf.week_in_cycle = a.week_in_cycle)
          OR (wf.id IS NULL AND ws.week_of = a.active_monday)
        )
      ORDER BY 
        CASE 
          WHEN ws.performance_score IS NOT NULL THEN ws.performance_date
          WHEN ws.confidence_score IS NOT NULL THEN ws.confidence_date
        END DESC NULLS LAST
      LIMIT 1
    ) AS last_activity_kind,
    (
      SELECT CASE 
        WHEN ws.performance_score IS NOT NULL THEN ws.performance_date
        WHEN ws.confidence_score IS NOT NULL THEN ws.confidence_date
        ELSE NULL
      END
      FROM weekly_scores ws
      LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
      WHERE ws.staff_id = a.staff_id
        AND (
          (wf.id IS NOT NULL AND wf.cycle = a.cycle_number AND wf.week_in_cycle = a.week_in_cycle)
          OR (wf.id IS NULL AND ws.week_of = a.active_monday)
        )
      ORDER BY 
        CASE 
          WHEN ws.performance_score IS NOT NULL THEN ws.performance_date
          WHEN ws.confidence_score IS NOT NULL THEN ws.confidence_date
        END DESC NULLS LAST
      LIMIT 1
    ) AS last_activity_at
  FROM assignments a
),
backlog_calc AS (
  SELECT
    s.*,
    COALESCE((
      SELECT COUNT(*)::int
      FROM user_backlog_v2 ub
      WHERE ub.staff_id = s.staff_id
        AND ub.resolved_on IS NULL
    ), 0) AS backlog_count
  FROM scores s
)
SELECT 
  bc.staff_id,
  bc.staff_name,
  bc.role_id,
  bc.role_name,
  bc.location_id,
  bc.location_name,
  bc.organization_id,
  bc.organization_name,
  bc.active_monday,
  bc.cycle_number,
  bc.week_in_cycle,
  bc.phase,
  bc.checkin_due,
  bc.checkout_open,
  bc.checkout_due,
  bc.required_count,
  bc.conf_count,
  bc.perf_count,
  bc.backlog_count,
  bc.last_activity_kind,
  bc.last_activity_at,
  bc.source_used,
  bc.tz
FROM backlog_calc bc
ORDER BY 
  bc.organization_name,
  bc.location_name,
  bc.staff_name;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_staff_statuses IS 'Returns staff status - uses cycle/week for weekly_focus, week_of for weekly_plan';
