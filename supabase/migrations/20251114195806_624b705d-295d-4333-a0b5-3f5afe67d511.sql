-- Update get_staff_statuses to use single source per person
DROP FUNCTION IF EXISTS get_staff_statuses(uuid, timestamptz);

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
source_choice AS (
  SELECT
    a.staff_id,
    a.staff_name,
    a.role_id,
    a.role_name,
    a.location_id,
    a.location_name,
    a.organization_id,
    a.organization_name,
    a.active_monday,
    a.cycle_number,
    a.week_in_cycle,
    a.phase,
    a.checkin_due,
    a.checkout_open,
    a.checkout_due,
    a.tz,
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
    CASE
      WHEN a.source_used = 'plan' THEN (
        SELECT COUNT(*)::int
        FROM weekly_scores ws
        WHERE ws.staff_id = a.staff_id
          AND ws.weekly_focus_id LIKE 'plan:%'
          AND ws.confidence_score IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM weekly_plan wp
            WHERE wp.id = (substring(ws.weekly_focus_id from 'plan:(\d+)')::bigint)
              AND wp.role_id = a.role_id::int
              AND wp.week_start_date = a.active_monday
              AND wp.status = 'locked'
              AND wp.self_select = false
              AND (wp.org_id = a.organization_id OR wp.org_id IS NULL)
          )
      )
      ELSE (
        SELECT COUNT(*)::int
        FROM weekly_scores ws
        JOIN weekly_focus wf
          ON wf.id = ws.weekly_focus_id::uuid
         AND wf.role_id = a.role_id
         AND wf.cycle = a.cycle_number
         AND wf.week_in_cycle = a.week_in_cycle
         AND wf.self_select = false
        WHERE ws.staff_id = a.staff_id
          AND ws.confidence_score IS NOT NULL
      )
    END AS conf_count,
    CASE
      WHEN a.source_used = 'plan' THEN (
        SELECT COUNT(*)::int
        FROM weekly_scores ws
        WHERE ws.staff_id = a.staff_id
          AND ws.weekly_focus_id LIKE 'plan:%'
          AND ws.performance_score IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM weekly_plan wp
            WHERE wp.id = (substring(ws.weekly_focus_id from 'plan:(\d+)')::bigint)
              AND wp.role_id = a.role_id::int
              AND wp.week_start_date = a.active_monday
              AND wp.status = 'locked'
              AND wp.self_select = false
              AND (wp.org_id = a.organization_id OR wp.org_id IS NULL)
          )
      )
      ELSE (
        SELECT COUNT(*)::int
        FROM weekly_scores ws
        JOIN weekly_focus wf
          ON wf.id = ws.weekly_focus_id::uuid
         AND wf.role_id = a.role_id
         AND wf.cycle = a.cycle_number
         AND wf.week_in_cycle = a.week_in_cycle
         AND wf.self_select = false
        WHERE ws.staff_id = a.staff_id
          AND ws.performance_score IS NOT NULL
      )
    END AS perf_count,
    (
      SELECT GREATEST(
        COALESCE(MAX(ws.confidence_date), '-infinity'::timestamptz),
        COALESCE(MAX(ws.performance_date), '-infinity'::timestamptz)
      )
      FROM weekly_scores ws
      WHERE ws.staff_id = a.staff_id
    ) AS last_activity_at_raw
  FROM assignments a
),
activity AS (
  SELECT
    s.*,
    CASE
      WHEN s.last_activity_at_raw = '-infinity'::timestamptz THEN NULL
      ELSE s.last_activity_at_raw
    END AS last_activity_at,
    CASE
      WHEN s.last_activity_at_raw = '-infinity'::timestamptz THEN NULL
      WHEN EXISTS (
        SELECT 1 FROM weekly_scores ws
        WHERE ws.staff_id = s.staff_id
          AND ws.performance_date = s.last_activity_at_raw
      ) THEN 'performance'
      ELSE 'confidence'
    END AS last_activity_kind
  FROM scores s
),
backlog AS (
  SELECT
    a.staff_id,
    COALESCE(COUNT(ub.id), 0)::int AS backlog_count
  FROM activity a
  LEFT JOIN user_backlog_v2 ub ON ub.staff_id = a.staff_id AND ub.resolved_on IS NULL
  GROUP BY a.staff_id
)
SELECT
  a.staff_id,
  a.staff_name,
  a.role_id,
  a.role_name,
  a.location_id,
  a.location_name,
  a.organization_id,
  a.organization_name,
  a.active_monday,
  a.cycle_number,
  a.week_in_cycle,
  a.phase,
  a.checkin_due,
  a.checkout_open,
  a.checkout_due,
  a.required_count,
  a.conf_count,
  a.perf_count,
  b.backlog_count,
  a.last_activity_kind,
  a.last_activity_at,
  a.source_used,
  a.tz
FROM activity a
JOIN backlog b USING (staff_id)
ORDER BY a.staff_name;
$$ LANGUAGE sql STABLE;