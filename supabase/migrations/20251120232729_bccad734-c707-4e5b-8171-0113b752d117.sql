-- Fix submission window matching to check scores at week level, not slot level
DROP FUNCTION IF EXISTS get_staff_submission_windows(uuid, date) CASCADE;

CREATE OR REPLACE FUNCTION get_staff_submission_windows(
  p_staff_id uuid,
  p_since date DEFAULT NULL
)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  role_id bigint,
  location_id uuid,
  week_of date,
  cycle_number int,
  week_in_cycle int,
  slot_index int,
  action_id bigint,
  required boolean,
  is_self_select boolean,
  metric text,
  status text,
  due_at timestamptz,
  submitted_at timestamptz,
  submitted_late boolean,
  on_time boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff record;
  v_location record;
BEGIN
  -- Get staff info
  SELECT s.*, s.id as staff_id_val, s.name as staff_name_val, s.role_id as role_id_val, s.primary_location_id
  INTO v_staff
  FROM staff s
  WHERE s.id = p_staff_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Get location info
  SELECT l.*, l.id as location_id_val
  INTO v_location
  FROM locations l
  WHERE l.id = v_staff.primary_location_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Return submission windows with week-level score matching
  RETURN QUERY
  WITH combined_assignments AS (
    -- Get all assignments (from plan or focus)
    SELECT
      date_trunc('week', wp.week_start_date)::date as week_of,
      wp.role_id,
      wp.display_order as slot_index,
      wp.action_id,
      NOT wp.self_select as required,
      wp.self_select as is_self_select,
      EXTRACT(YEAR FROM wp.week_start_date)::int as iso_year,
      EXTRACT(WEEK FROM wp.week_start_date)::int as iso_week
    FROM weekly_plan wp
    WHERE wp.role_id = v_staff.role_id_val
      AND wp.status = 'locked'
      AND (p_since IS NULL OR wp.week_start_date >= p_since)
    
    UNION ALL
    
    SELECT
      date_trunc('week', wf.week_start_date)::date as week_of,
      wf.role_id,
      wf.display_order as slot_index,
      wf.action_id,
      NOT wf.self_select as required,
      wf.self_select as is_self_select,
      EXTRACT(YEAR FROM wf.week_start_date)::int as iso_year,
      EXTRACT(WEEK FROM wf.week_start_date)::int as iso_week
    FROM weekly_focus wf
    WHERE wf.role_id = v_staff.role_id_val
      AND (p_since IS NULL OR wf.week_start_date >= p_since)
      AND NOT EXISTS (
        SELECT 1 FROM weekly_plan wp2
        WHERE wp2.role_id = wf.role_id
          AND wp2.week_start_date = wf.week_start_date
          AND wp2.status = 'locked'
      )
  ),
  week_scores AS (
    -- Get scores aggregated by week and metric (not by slot)
    SELECT
      date_trunc('week', ws.week_of)::date as week_of,
      'confidence' as metric,
      MAX(ws.confidence_date) as submitted_at,
      MAX(CASE WHEN ws.confidence_late THEN 1 ELSE 0 END) = 1 as submitted_late
    FROM weekly_scores ws
    WHERE ws.staff_id = p_staff_id
      AND ws.confidence_score IS NOT NULL
      AND (p_since IS NULL OR ws.week_of >= p_since)
    GROUP BY date_trunc('week', ws.week_of)::date
    
    UNION ALL
    
    SELECT
      date_trunc('week', ws.week_of)::date as week_of,
      'performance' as metric,
      MAX(ws.performance_date) as submitted_at,
      MAX(CASE WHEN ws.performance_late THEN 1 ELSE 0 END) = 1 as submitted_late
    FROM weekly_scores ws
    WHERE ws.staff_id = p_staff_id
      AND ws.performance_score IS NOT NULL
      AND (p_since IS NULL OR ws.week_of >= p_since)
    GROUP BY date_trunc('week', ws.week_of)::date
  ),
  cycle_info AS (
    SELECT
      week_of,
      FLOOR((week_of - v_location.program_start_date) / (v_location.cycle_length_weeks * 7))::int + 1 as cycle_number,
      (((week_of - v_location.program_start_date) / 7) % v_location.cycle_length_weeks)::int + 1 as week_in_cycle
    FROM (SELECT DISTINCT week_of FROM combined_assignments) weeks
  ),
  deadlines AS (
    SELECT
      week_of,
      (week_of + INTERVAL '1 day' + TIME '00:00:00') AT TIME ZONE v_location.timezone AT TIME ZONE 'UTC' as conf_due,
      (week_of + INTERVAL '3 days' + TIME '12:00:00') AT TIME ZONE v_location.timezone AT TIME ZONE 'UTC' as perf_due
    FROM (SELECT DISTINCT week_of FROM combined_assignments) weeks
  )
  SELECT
    p_staff_id as staff_id,
    v_staff.staff_name_val as staff_name,
    v_staff.role_id_val as role_id,
    v_location.location_id_val as location_id,
    ca.week_of,
    ci.cycle_number,
    ci.week_in_cycle,
    ca.slot_index,
    ca.action_id,
    ca.required,
    ca.is_self_select,
    m.metric,
    CASE
      WHEN ws.submitted_at IS NOT NULL AND ws.submitted_at <= d.conf_due AND m.metric = 'confidence' THEN 'on_time'
      WHEN ws.submitted_at IS NOT NULL AND ws.submitted_at <= d.perf_due AND m.metric = 'performance' THEN 'on_time'
      WHEN ws.submitted_at IS NOT NULL AND ws.submitted_late THEN 'late'
      WHEN ws.submitted_at IS NOT NULL THEN 'on_time'
      WHEN NOW() < d.conf_due AND m.metric = 'confidence' THEN 'pending'
      WHEN NOW() < d.perf_due AND m.metric = 'performance' THEN 'pending'
      ELSE 'missing'
    END as status,
    CASE WHEN m.metric = 'confidence' THEN d.conf_due ELSE d.perf_due END as due_at,
    ws.submitted_at,
    COALESCE(ws.submitted_late, false) as submitted_late,
    CASE
      WHEN ws.submitted_at IS NOT NULL AND ws.submitted_at <= d.conf_due AND m.metric = 'confidence' THEN true
      WHEN ws.submitted_at IS NOT NULL AND ws.submitted_at <= d.perf_due AND m.metric = 'performance' THEN true
      WHEN ws.submitted_at IS NOT NULL AND NOT ws.submitted_late THEN true
      ELSE false
    END as on_time
  FROM combined_assignments ca
  CROSS JOIN (SELECT 'confidence' as metric UNION ALL SELECT 'performance') m
  LEFT JOIN cycle_info ci ON ci.week_of = ca.week_of
  LEFT JOIN deadlines d ON d.week_of = ca.week_of
  LEFT JOIN week_scores ws ON ws.week_of = ca.week_of AND ws.metric = m.metric
  ORDER BY ca.week_of DESC, ca.slot_index, m.metric;
END;
$$;