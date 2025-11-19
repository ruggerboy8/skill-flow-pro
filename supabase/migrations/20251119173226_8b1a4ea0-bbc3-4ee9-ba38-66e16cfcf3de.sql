-- Remove onboarding_weeks column and simplify participation logic
-- Required submissions now start on the Monday on or after hire_date

-- Drop existing view and function
DROP VIEW IF EXISTS view_staff_submission_windows CASCADE;
DROP FUNCTION IF EXISTS get_staff_submission_windows(uuid) CASCADE;

-- Remove onboarding_weeks column from staff table
ALTER TABLE staff DROP COLUMN IF EXISTS onboarding_weeks;

-- Recreate view with simplified logic: first required submission is Monday on/after hire_date
CREATE OR REPLACE VIEW view_staff_submission_windows AS
WITH staff_participation AS (
  SELECT
    s.id AS staff_id,
    s.name AS staff_name,
    s.role_id,
    l.id AS location_id,
    l.timezone,
    l.program_start_date,
    l.cycle_length_weeks,
    s.hire_date,
    -- participation_start_monday is the Monday on or after hire_date
    CASE
      WHEN EXTRACT(DOW FROM s.hire_date) = 1 THEN s.hire_date
      ELSE s.hire_date + ((8 - EXTRACT(DOW FROM s.hire_date)::integer) % 7)
    END AS participation_start_monday,
    -- location program start, also adjusted to Monday
    CASE
      WHEN EXTRACT(DOW FROM l.program_start_date) = 1 THEN l.program_start_date
      ELSE l.program_start_date + ((8 - EXTRACT(DOW FROM l.program_start_date)::integer) % 7)
    END AS location_program_start_monday
  FROM staff s
  INNER JOIN locations l ON l.id = s.primary_location_id
  WHERE s.is_participant = true
    AND s.role_id IS NOT NULL
    AND l.active = true
),
week_series AS (
  SELECT
    sp.staff_id,
    sp.staff_name,
    sp.role_id,
    sp.location_id,
    sp.timezone,
    sp.cycle_length_weeks,
    sp.participation_start_monday,
    generate_series(
      GREATEST(sp.participation_start_monday, sp.location_program_start_monday),
      CURRENT_DATE + INTERVAL '4 weeks',
      '1 week'::interval
    )::date AS week_of
  FROM staff_participation sp
),
week_context AS (
  SELECT
    ws.*,
    ((ws.week_of - ws.participation_start_monday) / 7)::integer AS weeks_since_start,
    ((ws.week_of - ws.participation_start_monday) / 7)::integer / ws.cycle_length_weeks AS cycle_number,
    (((ws.week_of - ws.participation_start_monday) / 7)::integer % ws.cycle_length_weeks) + 1 AS week_in_cycle
  FROM week_series ws
),
assignments AS (
  SELECT
    wc.staff_id,
    wc.staff_name,
    wc.role_id,
    wc.location_id,
    wc.week_of,
    wc.cycle_number,
    wc.week_in_cycle,
    wc.timezone,
    COALESCE(wf.action_id, wp.action_id) AS action_id,
    COALESCE(wf.display_order, wp.display_order, 0) AS slot_index,
    COALESCE(wf.self_select, wp.self_select, false) AS self_select
  FROM week_context wc
  LEFT JOIN weekly_focus wf ON wf.role_id = wc.role_id
    AND wf.cycle = wc.cycle_number
    AND wf.week_in_cycle = wc.week_in_cycle
  LEFT JOIN weekly_plan wp ON wp.role_id = wc.role_id
    AND wp.week_start_date = wc.week_of
    AND wp.status = 'locked'
),
submission_metrics AS (
  SELECT
    a.*,
    -- Required: must have an assignment (not self-select) and week must be in past or current
    (a.action_id IS NOT NULL AND a.self_select = false AND a.week_of <= CURRENT_DATE) AS required,
    ws.confidence_score,
    ws.confidence_date,
    ws.performance_score,
    ws.performance_date
  FROM assignments a
  LEFT JOIN weekly_scores ws ON ws.staff_id = a.staff_id
    AND ws.week_of = a.week_of
)
SELECT
  sm.staff_id,
  sm.staff_name,
  sm.role_id,
  sm.location_id,
  sm.week_of,
  sm.cycle_number,
  sm.week_in_cycle,
  sm.slot_index,
  sm.action_id,
  sm.required,
  'confidence' AS metric,
  (sm.week_of || ' 23:59:59')::timestamp AS due_at,
  sm.confidence_date AS submitted_at,
  (sm.confidence_date IS NOT NULL) AS submitted_late,
  (sm.confidence_date IS NOT NULL) AS on_time,
  CASE
    WHEN sm.confidence_date IS NOT NULL THEN 'submitted'
    WHEN sm.week_of > CURRENT_DATE THEN 'pending'
    ELSE 'missing'
  END AS status
FROM submission_metrics sm
WHERE sm.action_id IS NOT NULL

UNION ALL

SELECT
  sm.staff_id,
  sm.staff_name,
  sm.role_id,
  sm.location_id,
  sm.week_of,
  sm.cycle_number,
  sm.week_in_cycle,
  sm.slot_index,
  sm.action_id,
  sm.required,
  'performance' AS metric,
  (sm.week_of + INTERVAL '3 days' || ' 23:59:59')::timestamp AS due_at,
  sm.performance_date AS submitted_at,
  (sm.performance_date IS NOT NULL AND sm.performance_date > (sm.week_of + INTERVAL '3 days' || ' 23:59:59')::timestamp) AS submitted_late,
  (sm.performance_date IS NOT NULL AND sm.performance_date <= (sm.week_of + INTERVAL '3 days' || ' 23:59:59')::timestamp) AS on_time,
  CASE
    WHEN sm.performance_date IS NOT NULL THEN 'submitted'
    WHEN sm.week_of + INTERVAL '3 days' > CURRENT_DATE THEN 'pending'
    ELSE 'missing'
  END AS status
FROM submission_metrics sm
WHERE sm.action_id IS NOT NULL
ORDER BY week_of DESC, metric, slot_index;

-- Recreate RPC function
CREATE OR REPLACE FUNCTION get_staff_submission_windows(p_staff_id uuid)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  role_id bigint,
  location_id uuid,
  week_of date,
  cycle_number integer,
  week_in_cycle integer,
  slot_index integer,
  action_id bigint,
  required boolean,
  metric text,
  due_at timestamp,
  submitted_at timestamp with time zone,
  submitted_late boolean,
  on_time boolean,
  status text
) AS $$
BEGIN
  RETURN QUERY
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
    v.due_at,
    v.submitted_at,
    v.submitted_late,
    v.on_time,
    v.status
  FROM view_staff_submission_windows v
  WHERE v.staff_id = p_staff_id
  ORDER BY v.week_of DESC, v.metric, v.slot_index;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;