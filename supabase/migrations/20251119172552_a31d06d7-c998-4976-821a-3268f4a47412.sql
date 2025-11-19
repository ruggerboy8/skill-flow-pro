-- Fix view_staff_submission_windows to properly handle NULL hire_date and onboarding_weeks

-- Step 1: Backfill hire_date from created_at for existing staff
UPDATE staff 
SET hire_date = COALESCE(hire_date, created_at::date)
WHERE hire_date IS NULL;

-- Step 2: Enforce NOT NULL constraint on hire_date
ALTER TABLE staff 
ALTER COLUMN hire_date SET NOT NULL;

-- Step 3: Set default for future inserts
ALTER TABLE staff 
ALTER COLUMN hire_date SET DEFAULT CURRENT_DATE;

-- Step 4: Drop existing view and ALL function overloads
DROP VIEW IF EXISTS view_staff_submission_windows CASCADE;
DROP FUNCTION IF EXISTS get_staff_submission_windows(uuid, date) CASCADE;
DROP FUNCTION IF EXISTS get_staff_submission_windows(uuid) CASCADE;

-- Step 5: Recreate view with NULL-safe logic
CREATE OR REPLACE VIEW view_staff_submission_windows AS
WITH staff_locations AS (
  SELECT 
    s.id AS staff_id,
    s.name AS staff_name,
    s.role_id,
    s.primary_location_id AS location_id,
    s.hire_date,
    s.onboarding_weeks,
    COALESCE(s.hire_date, s.created_at::date) AS effective_hire_date,
    COALESCE(s.onboarding_weeks, 0) AS effective_onboarding_weeks,
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
    (date_trunc('week', sl.effective_hire_date + interval '1 day')::date + interval '7 days')::date AS participation_start_monday,
    (date_trunc('week', sl.effective_hire_date + interval '1 day')::date + interval '7 days' + (sl.effective_onboarding_weeks * interval '7 days'))::date AS eligible_monday
  FROM staff_locations sl
),
week_series AS (
  SELECT
    sp.*,
    generate_series(
      GREATEST(sp.eligible_monday, sp.location_program_start_monday),
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
    'plan' AS source
  FROM week_context wc
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
  (week_of + interval '1 day' + interval '12 hours')::timestamptz AT TIME ZONE timezone AS due_at,
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

-- Step 6: Recreate RPC function
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

-- Step 7: Sanity check (warning only)
DO $$
DECLARE
  test_count int;
  test_staff_id uuid;
  test_staff_name text;
BEGIN
  SELECT id, name INTO test_staff_id, test_staff_name
  FROM staff 
  WHERE is_participant = true 
    AND role_id IS NOT NULL
    AND primary_location_id IS NOT NULL
  LIMIT 1;
  
  IF test_staff_id IS NOT NULL THEN
    EXECUTE format('SELECT COUNT(*) FROM get_staff_submission_windows(%L)', test_staff_id) INTO test_count;
    
    IF test_count = 0 THEN
      RAISE WARNING 'Sanity check note: get_staff_submission_windows returned 0 rows for staff % (%). This may be expected if they have no assignments.', 
        test_staff_name, test_staff_id;
    ELSE
      RAISE NOTICE 'Sanity check PASSED: get_staff_submission_windows returned % rows for staff % (%)', 
        test_count, test_staff_name, test_staff_id;
    END IF;
  ELSE
    RAISE NOTICE 'Sanity check SKIPPED: No participant staff found';
  END IF;
END $$;