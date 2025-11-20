
-- Fix view_staff_submission_windows to respect participation_start_at field
DROP VIEW IF EXISTS view_staff_submission_windows CASCADE;
DROP FUNCTION IF EXISTS get_staff_submission_windows(uuid, date) CASCADE;

CREATE OR REPLACE VIEW view_staff_submission_windows AS
WITH staff_locations AS (
  SELECT
    s.id AS staff_id,
    s.name AS staff_name,
    s.role_id,
    s.primary_location_id AS location_id,
    s.hire_date,
    s.participation_start_at,
    l.program_start_date,
    l.cycle_length_weeks,
    l.timezone,
    date_trunc('week', l.program_start_date::timestamp AT TIME ZONE l.timezone)::date AS location_program_start_monday
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.role_id IS NOT NULL
    AND s.primary_location_id IS NOT NULL
    AND s.is_participant = true
),
staff_participation AS (
  SELECT
    sl.*,
    COALESCE(
      date_trunc('week', sl.participation_start_at)::date,
      (date_trunc('week', sl.hire_date + interval '1 day')::date + interval '7 days')::date
    ) AS participation_start_monday
  FROM staff_locations sl
),
week_series AS (
  SELECT
    sp.*,
    generate_series(
      GREATEST(sp.participation_start_monday, sp.location_program_start_monday),
      date_trunc('week', CURRENT_DATE)::date,
      '7 days'::interval
    )::date AS week_of
  FROM staff_participation sp
),
week_context AS (
  SELECT
    ws.*,
    ((ws.week_of - ws.location_program_start_monday) / 7)::int AS week_index,
    CASE
      WHEN ((ws.week_of - ws.location_program_start_monday) / 7) = 0 THEN 1
      ELSE ((((ws.week_of - ws.location_program_start_monday) / 7)::int) / ws.cycle_length_weeks)::int + 1
    END AS cycle_number,
    CASE
      WHEN ((ws.week_of - ws.location_program_start_monday) / 7) = 0 THEN 1
      ELSE ((((ws.week_of - ws.location_program_start_monday) / 7)::int) % ws.cycle_length_weeks)::int + 1
    END AS week_in_cycle
  FROM week_series ws
),
week_plan_data AS (
  SELECT
    wc.staff_id,
    wc.staff_name,
    wc.role_id,
    wc.location_id,
    wc.week_of,
    wc.cycle_number,
    wc.week_in_cycle,
    wc.timezone,
    wp.action_id,
    wp.display_order,
    wp.self_select,
    ('plan:' || wp.id::text) AS assignment_id,
    'plan' AS source
  FROM week_context wc
  LEFT JOIN weekly_plan wp ON
    wp.week_start_date = wc.week_of
    AND wp.role_id = wc.role_id
    AND wp.status = 'locked'
  WHERE wp.action_id IS NOT NULL
),
week_focus_data AS (
  SELECT
    wc.staff_id,
    wc.staff_name,
    wc.role_id,
    wc.location_id,
    wc.week_of,
    wc.cycle_number,
    wc.week_in_cycle,
    wc.timezone,
    wf.action_id,
    wf.display_order,
    wf.self_select,
    wf.id::text AS assignment_id,
    'focus' AS source
  FROM week_context wc
  LEFT JOIN weekly_focus wf ON
    wf.cycle = wc.cycle_number
    AND wf.week_in_cycle = wc.week_in_cycle
    AND wf.role_id = wc.role_id
  WHERE wf.action_id IS NOT NULL
    AND wc.cycle_number IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM weekly_plan wp
      WHERE wp.week_start_date = wc.week_of
        AND wp.role_id = wc.role_id
        AND wp.status = 'locked'
    )
),
combined_assignments AS (
  SELECT * FROM week_plan_data
  UNION ALL
  SELECT * FROM week_focus_data
),
score_data AS (
  SELECT
    ca.*,
    ws.confidence_score,
    ws.confidence_date,
    ws.confidence_late,
    ws.performance_score,
    ws.performance_date,
    ws.performance_late,
    ws.selected_action_id,
    ws.weekly_focus_id,
    CASE
      WHEN ca.self_select THEN ws.selected_action_id
      ELSE ca.action_id
    END AS effective_action_id
  FROM combined_assignments ca
  LEFT JOIN weekly_scores ws ON
    ws.staff_id = ca.staff_id
    AND ws.week_of = ca.week_of
    AND (
      ws.weekly_focus_id = ca.assignment_id
      OR (ws.weekly_focus_id IS NULL AND ws.site_action_id = ca.action_id)
    )
)
SELECT
  staff_id,
  staff_name,
  role_id,
  location_id,
  week_of,
  cycle_number,
  week_in_cycle,
  display_order AS slot_index,
  effective_action_id AS action_id,
  true AS required,
  self_select AS is_self_select,
  (week_of + interval '1 day' + interval '12 hours')::timestamptz AT TIME ZONE timezone AS due_at,
  CASE
    WHEN confidence_score IS NOT NULL AND confidence_late = false THEN 'on_time'
    WHEN confidence_score IS NOT NULL AND confidence_late = true THEN 'late'
    WHEN confidence_score IS NULL AND (week_of + interval '1 day' + interval '12 hours')::timestamptz < NOW() THEN 'missing'
    ELSE 'pending'
  END AS status,
  confidence_date AS submitted_at,
  confidence_late AS submitted_late,
  CASE
    WHEN confidence_score IS NOT NULL AND confidence_late = false THEN true
    WHEN confidence_score IS NOT NULL AND confidence_late = true THEN false
    ELSE NULL
  END AS on_time,
  'confidence' AS metric
FROM score_data
WHERE effective_action_id IS NOT NULL
UNION ALL
SELECT
  staff_id,
  staff_name,
  role_id,
  location_id,
  week_of,
  cycle_number,
  week_in_cycle,
  display_order AS slot_index,
  effective_action_id AS action_id,
  true AS required,
  self_select AS is_self_select,
  (week_of + interval '4 days')::timestamptz AT TIME ZONE timezone AS due_at,
  CASE
    WHEN performance_score IS NOT NULL AND performance_late = false THEN 'on_time'
    WHEN performance_score IS NOT NULL AND performance_late = true THEN 'late'
    WHEN performance_score IS NULL AND (week_of + interval '4 days')::timestamptz < NOW() THEN 'missing'
    ELSE 'pending'
  END AS status,
  performance_date AS submitted_at,
  performance_late AS submitted_late,
  CASE
    WHEN performance_score IS NOT NULL AND performance_late = false THEN true
    WHEN performance_score IS NOT NULL AND performance_late = true THEN false
    ELSE NULL
  END AS on_time,
  'performance' AS metric
FROM score_data
WHERE effective_action_id IS NOT NULL;

CREATE OR REPLACE FUNCTION get_staff_submission_windows(
  p_staff_id uuid,
  p_since date DEFAULT NULL
)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  role_id int,
  location_id uuid,
  week_of date,
  cycle_number int,
  week_in_cycle int,
  slot_index int,
  action_id int,
  required boolean,
  is_self_select boolean,
  metric text,
  status text,
  due_at timestamptz,
  submitted_at timestamptz,
  submitted_late boolean,
  on_time boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    v.staff_id,
    v.staff_name,
    v.role_id,
    v.location_id,
    v.week_of,
    v.cycle_number,
    v.week_in_cycle,
    v.slot_index,
    v.action_id,
    v.required,
    v.is_self_select,
    v.metric,
    v.status,
    v.due_at,
    v.submitted_at,
    v.submitted_late,
    v.on_time
  FROM view_staff_submission_windows v
  WHERE v.staff_id = p_staff_id
    AND (p_since IS NULL OR v.week_of >= p_since)
  ORDER BY v.week_of DESC, v.slot_index, v.metric;
$$;
