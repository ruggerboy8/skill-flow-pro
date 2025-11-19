-- Drop and recreate view_staff_submission_windows with participation_start_at fallback
DROP VIEW IF EXISTS view_staff_submission_windows CASCADE;

CREATE VIEW view_staff_submission_windows AS
WITH staff_locations AS (
  SELECT 
    s.id AS staff_id,
    s.name AS staff_name,
    s.role_id,
    s.primary_location_id AS location_id,
    s.hire_date,
    s.participation_start_at,
    s.onboarding_weeks,
    l.program_start_date,
    l.cycle_length_weeks,
    l.timezone
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.is_participant = true
),
week_series AS (
  SELECT 
    sl.staff_id,
    sl.staff_name,
    sl.role_id,
    sl.location_id,
    (DATE_TRUNC('week', (sl.program_start_date::timestamp AT TIME ZONE sl.timezone))::date + (weeks.week_offset * 7))::date AS week_of,
    ((weeks.week_offset / sl.cycle_length_weeks)::int + 1) AS cycle_number,
    ((weeks.week_offset % sl.cycle_length_weeks)::int + 1) AS week_in_cycle,
    sl.timezone
  FROM staff_locations sl
  CROSS JOIN GENERATE_SERIES(0, 520) AS weeks(week_offset)
  WHERE (DATE_TRUNC('week', (sl.program_start_date::timestamp AT TIME ZONE sl.timezone))::date + (weeks.week_offset * 7))::date 
        >= COALESCE(sl.hire_date, sl.participation_start_at::date, '1900-01-01'::date) + (sl.onboarding_weeks * 7)
    AND (DATE_TRUNC('week', (sl.program_start_date::timestamp AT TIME ZONE sl.timezone))::date + (weeks.week_offset * 7))::date <= CURRENT_DATE
),
focus_assignments AS (
  SELECT 
    ws.staff_id,
    ws.week_of,
    ws.cycle_number,
    ws.week_in_cycle,
    wf.id::text AS weekly_focus_id,
    (ROW_NUMBER() OVER (PARTITION BY ws.staff_id, ws.week_of, wf.role_id ORDER BY wf.display_order) - 1) AS slot_index,
    wf.action_id,
    NOT wf.self_select AS required
  FROM week_series ws
  JOIN weekly_focus wf 
    ON wf.role_id = ws.role_id 
    AND wf.cycle = ws.cycle_number 
    AND wf.week_in_cycle = ws.week_in_cycle
  WHERE ws.cycle_number <= 3
),
plan_assignments AS (
  SELECT 
    ws.staff_id,
    ws.week_of,
    ws.cycle_number,
    ws.week_in_cycle,
    ('plan:' || wp.id)::text AS weekly_focus_id,
    (ROW_NUMBER() OVER (PARTITION BY ws.staff_id, ws.week_of, wp.role_id ORDER BY wp.display_order) - 1) AS slot_index,
    wp.action_id,
    NOT wp.self_select AS required
  FROM week_series ws
  JOIN weekly_plan wp 
    ON wp.role_id = ws.role_id 
    AND wp.week_start_date = ws.week_of
    AND wp.status = 'locked'
  WHERE ws.cycle_number >= 4
),
all_assignments AS (
  SELECT * FROM focus_assignments
  UNION ALL
  SELECT * FROM plan_assignments
),
scores_data AS (
  SELECT 
    aa.staff_id,
    aa.week_of,
    aa.cycle_number,
    aa.week_in_cycle,
    aa.weekly_focus_id,
    aa.slot_index,
    aa.action_id,
    aa.required,
    ws.confidence_score,
    ws.confidence_date,
    ws.confidence_late,
    ws.performance_score,
    ws.performance_date,
    ws.performance_late
  FROM all_assignments aa
  LEFT JOIN weekly_scores ws 
    ON ws.staff_id = aa.staff_id 
    AND ws.weekly_focus_id = aa.weekly_focus_id
),
deadlines AS (
  SELECT 
    sd.*,
    ws2.timezone,
    ((sd.week_of + 1) || ' 12:00:00 ' || ws2.timezone)::timestamptz AS checkin_due,
    ((sd.week_of + 4) || ' 17:00:00 ' || ws2.timezone)::timestamptz AS checkout_due
  FROM scores_data sd
  JOIN week_series ws2 
    ON ws2.staff_id = sd.staff_id 
    AND ws2.week_of = sd.week_of
),
metrics_pivoted AS (
  SELECT 
    d.staff_id,
    d.week_of,
    d.cycle_number,
    d.week_in_cycle,
    'confidence'::text AS metric,
    d.slot_index,
    d.action_id,
    d.required,
    d.checkin_due AS due_at,
    d.confidence_date AS submitted_at,
    d.confidence_late AS submitted_late,
    CASE 
      WHEN d.confidence_score IS NOT NULL AND d.confidence_date <= d.checkin_due THEN true
      WHEN d.confidence_score IS NOT NULL AND d.confidence_date > d.checkin_due THEN false
      ELSE NULL
    END AS on_time,
    CASE
      WHEN d.confidence_score IS NOT NULL THEN 'submitted'
      WHEN CURRENT_TIMESTAMP < d.checkin_due THEN 'pending'
      ELSE 'missing'
    END AS status
  FROM deadlines d
  
  UNION ALL
  
  SELECT 
    d.staff_id,
    d.week_of,
    d.cycle_number,
    d.week_in_cycle,
    'performance'::text AS metric,
    d.slot_index,
    d.action_id,
    d.required,
    d.checkout_due AS due_at,
    d.performance_date AS submitted_at,
    d.performance_late AS submitted_late,
    CASE 
      WHEN d.performance_score IS NOT NULL AND d.performance_date <= d.checkout_due THEN true
      WHEN d.performance_score IS NOT NULL AND d.performance_date > d.checkout_due THEN false
      ELSE NULL
    END AS on_time,
    CASE
      WHEN d.performance_score IS NOT NULL THEN 'submitted'
      WHEN CURRENT_TIMESTAMP < d.checkout_due THEN 'pending'
      ELSE 'missing'
    END AS status
  FROM deadlines d
)
SELECT 
  mp.week_of,
  mp.cycle_number,
  mp.week_in_cycle,
  mp.metric,
  mp.slot_index,
  mp.action_id,
  mp.required,
  mp.due_at,
  mp.submitted_at,
  mp.status,
  mp.on_time,
  mp.submitted_late,
  ws.staff_id,
  ws.staff_name,
  ws.role_id,
  ws.location_id
FROM metrics_pivoted mp
JOIN week_series ws 
  ON ws.staff_id = mp.staff_id 
  AND ws.week_of = mp.week_of
ORDER BY mp.staff_id, mp.week_of, mp.metric, mp.slot_index;