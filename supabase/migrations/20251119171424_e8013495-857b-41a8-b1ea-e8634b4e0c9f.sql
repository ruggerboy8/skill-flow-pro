-- Backfill hire_date from created_at for existing staff
UPDATE staff 
SET hire_date = created_at::date 
WHERE hire_date IS NULL AND created_at IS NOT NULL;

-- Drop existing view
DROP VIEW IF EXISTS view_staff_submission_windows;

-- Drop existing function
DROP FUNCTION IF EXISTS get_staff_submission_windows(uuid);

-- Recreate view with NULL-safe logic and proper participation start calculation
CREATE OR REPLACE VIEW view_staff_submission_windows AS
WITH location_weeks AS (
  SELECT 
    s.id AS staff_id,
    s.name AS staff_name,
    s.role_id,
    s.primary_location_id AS location_id,
    l.program_start_date,
    l.cycle_length_weeks,
    l.timezone,
    -- Calculate participation_start: use participation_start_at if set, otherwise use hire_date or created_at
    COALESCE(
      s.participation_start_at::date,
      s.hire_date,
      s.created_at::date
    ) AS participation_start,
    generate_series(
      date_trunc('week', COALESCE(
        s.participation_start_at::date,
        s.hire_date,
        s.created_at::date
      ))::date,
      date_trunc('week', CURRENT_DATE)::date,
      '7 days'::interval
    )::date AS week_of
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.role_id IS NOT NULL
    AND s.primary_location_id IS NOT NULL
    AND s.is_participant = true
),
week_cycles AS (
  SELECT 
    *,
    -- NULL-safe calculation: if participation_start is NULL, cycle_number will be NULL
    -- Date subtraction gives days as integer, so divide directly
    CASE 
      WHEN participation_start IS NOT NULL THEN
        FLOOR((week_of - participation_start) / 7.0 / NULLIF(cycle_length_weeks, 0))::int + 1
      ELSE NULL
    END AS cycle_number,
    CASE 
      WHEN participation_start IS NOT NULL THEN
        (FLOOR((week_of - participation_start) / 7.0) % NULLIF(cycle_length_weeks, 0))::int + 1
      ELSE NULL
    END AS week_in_cycle
  FROM location_weeks
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
    'plan' AS source
  FROM week_cycles wc
  LEFT JOIN weekly_plan wp ON 
    wp.week_start_date = wc.week_of 
    AND wp.role_id = wc.role_id
    AND wp.status = 'active'
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
    'focus' AS source
  FROM week_cycles wc
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
        AND wp.status = 'active'
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
    -- Determine which action to use: selected_action_id if self_select, else action_id
    CASE 
      WHEN ca.self_select THEN ws.selected_action_id
      ELSE ca.action_id
    END AS effective_action_id
  FROM combined_assignments ca
  LEFT JOIN weekly_scores ws ON 
    ws.staff_id = ca.staff_id 
    AND ws.week_of = ca.week_of
    AND (
      (ca.self_select = false AND ws.site_action_id = ca.action_id) OR
      (ca.self_select = true AND ws.weekly_focus_id IN (
        SELECT id::text FROM weekly_focus wf2 
        WHERE wf2.cycle = ca.cycle_number 
          AND wf2.week_in_cycle = ca.week_in_cycle
          AND wf2.role_id = ca.role_id
          AND wf2.self_select = true
          AND wf2.display_order = ca.display_order
      ))
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
  self_select AS required,
  -- Calculate deadlines in location timezone
  (week_of + interval '1 day' + interval '12 hours')::timestamptz AT TIME ZONE timezone AS due_at,
  -- Determine status and submission info for confidence
  CASE
    WHEN confidence_score IS NOT NULL THEN 'submitted'
    WHEN (week_of + interval '1 day' + interval '12 hours')::timestamptz < NOW() THEN 'missing'
    ELSE 'pending'
  END AS status,
  confidence_date AS submitted_at,
  confidence_late AS submitted_late,
  CASE
    WHEN confidence_date IS NOT NULL AND confidence_date <= (week_of + interval '1 day' + interval '12 hours')::timestamptz THEN true
    WHEN confidence_date IS NOT NULL THEN false
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
  self_select AS required,
  (week_of + interval '4 days')::timestamptz AT TIME ZONE timezone AS due_at,
  CASE
    WHEN performance_score IS NOT NULL THEN 'submitted'
    WHEN (week_of + interval '4 days')::timestamptz < NOW() THEN 'missing'
    ELSE 'pending'
  END AS status,
  performance_date AS submitted_at,
  performance_late AS submitted_late,
  CASE
    WHEN performance_date IS NOT NULL AND performance_date <= (week_of + interval '4 days')::timestamptz THEN true
    WHEN performance_date IS NOT NULL THEN false
    ELSE NULL
  END AS on_time,
  'performance' AS metric
FROM score_data
WHERE effective_action_id IS NOT NULL;

-- Recreate RPC function
CREATE OR REPLACE FUNCTION get_staff_submission_windows(p_staff_id uuid)
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
    v.metric,
    v.status,
    v.due_at,
    v.submitted_at,
    v.submitted_late,
    v.on_time
  FROM view_staff_submission_windows v
  WHERE v.staff_id = p_staff_id
  ORDER BY v.week_of DESC, v.slot_index, v.metric;
$$;