-- Drop and recreate view_staff_submission_windows with 'locked' status filter
-- This aligns with the actual status values in weekly_assignments table

DROP VIEW IF EXISTS view_staff_submission_windows;

CREATE VIEW view_staff_submission_windows AS
WITH base_staff AS (
  SELECT 
    s.id AS staff_id,
    s.name AS staff_name,
    s.role_id,
    s.primary_location_id AS location_id,
    l.program_start_date,
    l.cycle_length_weeks,
    l.timezone
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.is_participant = true
),
week_context AS (
  SELECT
    bs.*,
    CURRENT_DATE AS today,
    (date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE bs.timezone)::date) AS active_monday,
    GREATEST(0,
      ((date_trunc('week', CURRENT_TIMESTAMP AT TIME ZONE bs.timezone)::date)
       - (date_trunc('week', bs.program_start_date::timestamp AT TIME ZONE bs.timezone)::date)) / 7
    )::int AS week_index
  FROM base_staff bs
),
cycle_calc AS (
  SELECT
    wc.*,
    CASE 
      WHEN wc.week_index = 0 THEN 1
      ELSE (wc.week_index / wc.cycle_length_weeks)::int + 1
    END AS cycle_number,
    CASE 
      WHEN wc.week_index = 0 THEN 1
      ELSE (wc.week_index % wc.cycle_length_weeks)::int + 1
    END AS week_in_cycle
  FROM week_context wc
),
assignments_data AS (
  SELECT
    cc.staff_id,
    cc.staff_name,
    cc.role_id,
    cc.location_id,
    cc.active_monday AS week_of,
    cc.cycle_number,
    cc.week_in_cycle,
    cc.timezone,
    wa.id AS assignment_id,
    wa.action_id,
    wa.self_select AS is_self_select,
    wa.display_order AS slot_index,
    NOT wa.self_select AS required
  FROM cycle_calc cc
  JOIN weekly_assignments wa 
    ON wa.role_id = cc.role_id::int
    AND wa.week_start_date = cc.active_monday
    AND wa.status = 'locked'
    AND (
      wa.location_id = cc.location_id
      OR (wa.org_id IS NOT NULL AND wa.location_id IS NULL 
          AND EXISTS (SELECT 1 FROM locations l2 WHERE l2.id = cc.location_id AND l2.organization_id = wa.org_id))
      OR (wa.org_id IS NULL AND wa.location_id IS NULL)
    )
),
conf_data AS (
  SELECT
    ad.staff_id,
    ad.staff_name,
    ad.role_id,
    ad.location_id,
    ad.week_of,
    ad.cycle_number,
    ad.week_in_cycle,
    ad.action_id,
    ad.is_self_select,
    ad.slot_index,
    ad.required,
    ws.confidence_score,
    ws.confidence_date AS submitted_at,
    ws.confidence_late AS submitted_late,
    ((ad.week_of + 1) || ' 12:00:00 ' || ad.timezone)::timestamptz AS due_at
  FROM assignments_data ad
  LEFT JOIN weekly_scores ws 
    ON ws.staff_id = ad.staff_id 
    AND ws.assignment_id = ('assign:' || ad.assignment_id::text)
),
perf_data AS (
  SELECT
    ad.staff_id,
    ad.staff_name,
    ad.role_id,
    ad.location_id,
    ad.week_of,
    ad.cycle_number,
    ad.week_in_cycle,
    ad.action_id,
    ad.is_self_select,
    ad.slot_index,
    ad.required,
    ws.performance_score,
    ws.performance_date AS submitted_at,
    ws.performance_late AS submitted_late,
    ((ad.week_of + 4) || ' 17:00:00 ' || ad.timezone)::timestamptz AS due_at
  FROM assignments_data ad
  LEFT JOIN weekly_scores ws 
    ON ws.staff_id = ad.staff_id 
    AND ws.assignment_id = ('assign:' || ad.assignment_id::text)
)
SELECT
  action_id,
  cycle_number,
  due_at,
  is_self_select,
  location_id,
  'confidence' AS metric,
  CASE
    WHEN submitted_at IS NULL THEN NULL
    WHEN submitted_at <= due_at THEN true
    ELSE false
  END AS on_time,
  required,
  role_id,
  slot_index,
  staff_id,
  staff_name,
  CASE
    WHEN confidence_score IS NULL THEN 'missing'
    WHEN submitted_at IS NULL THEN 'missing'
    WHEN submitted_at <= due_at THEN 'on_time'
    ELSE 'late'
  END AS status,
  submitted_at,
  submitted_late,
  week_in_cycle,
  week_of
FROM conf_data

UNION ALL

SELECT
  action_id,
  cycle_number,
  due_at,
  is_self_select,
  location_id,
  'performance' AS metric,
  CASE
    WHEN submitted_at IS NULL THEN NULL
    WHEN submitted_at <= due_at THEN true
    ELSE false
  END AS on_time,
  required,
  role_id,
  slot_index,
  staff_id,
  staff_name,
  CASE
    WHEN performance_score IS NULL THEN 'missing'
    WHEN submitted_at IS NULL THEN 'missing'
    WHEN submitted_at <= due_at THEN 'on_time'
    ELSE 'late'
  END AS status,
  submitted_at,
  submitted_late,
  week_in_cycle,
  week_of
FROM perf_data
ORDER BY staff_name, week_of, metric, slot_index;