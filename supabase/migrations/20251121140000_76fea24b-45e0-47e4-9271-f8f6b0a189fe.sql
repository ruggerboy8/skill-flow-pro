-- Fix ambiguous column reference in get_staff_submission_windows
DROP FUNCTION IF EXISTS get_staff_submission_windows(uuid, date);

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
LANGUAGE plpgsql
AS $$
DECLARE
  v_role_id int;
  v_location_id uuid;
BEGIN
  -- Get staff role and location
  SELECT s.role_id, s.primary_location_id
  INTO v_role_id, v_location_id
  FROM staff s
  WHERE s.id = p_staff_id;

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Staff not found or has no role assigned';
  END IF;

  RETURN QUERY
  WITH week_scores AS (
    SELECT 
      date_trunc('week', ws.week_of)::date as week_of_normalized,
      ws.metric,
      MAX(ws.confidence_date) as confidence_date,
      MAX(ws.performance_date) as performance_date,
      BOOL_OR(ws.confidence_late) as confidence_late,
      BOOL_OR(ws.performance_late) as performance_late
    FROM weekly_scores ws
    WHERE ws.staff_id = p_staff_id
      AND (p_since IS NULL OR ws.week_of >= p_since)
    GROUP BY date_trunc('week', ws.week_of)::date, ws.metric
  ),
  combined_assignments AS (
    -- Plan assignments (current and future)
    SELECT 
      wp.week_start_date as week_of,
      wp.display_order as slot_index,
      wp.action_id,
      wp.self_select as is_self_select,
      NOT wp.self_select as required,
      'plan' as source
    FROM weekly_plan wp
    WHERE wp.role_id = v_role_id
      AND wp.status = 'locked'
      AND (p_since IS NULL OR wp.week_start_date >= p_since)
    
    UNION ALL
    
    -- Focus assignments (historical)
    SELECT 
      wf.week_start_date as week_of,
      wf.display_order as slot_index,
      wf.action_id,
      wf.self_select as is_self_select,
      NOT wf.self_select as required,
      'focus' as source
    FROM weekly_focus wf
    WHERE wf.role_id = v_role_id
      AND (p_since IS NULL OR wf.week_start_date >= p_since)
  ),
  location_info AS (
    SELECT 
      l.id,
      l.timezone,
      l.program_start_date,
      l.cycle_length_weeks
    FROM locations l
    WHERE l.id = v_location_id
  ),
  assignments_with_cycle AS (
    SELECT 
      ca.*,
      FLOOR((ca.week_of - li.program_start_date) / 7 / li.cycle_length_weeks)::int + 1 as cycle_number,
      (FLOOR((ca.week_of - li.program_start_date) / 7) % li.cycle_length_weeks)::int + 1 as week_in_cycle,
      li.timezone
    FROM combined_assignments ca
    CROSS JOIN location_info li
  )
  SELECT 
    p_staff_id as staff_id,
    s.name as staff_name,
    v_role_id as role_id,
    v_location_id as location_id,
    awc.week_of,
    awc.cycle_number,
    awc.week_in_cycle,
    awc.slot_index,
    awc.action_id,
    awc.required,
    awc.is_self_select,
    metric_type.metric,
    CASE
      WHEN wsc.confidence_date IS NOT NULL OR wsp.performance_date IS NOT NULL THEN
        CASE
          WHEN metric_type.metric = 'confidence' AND wsc.confidence_late THEN 'late'
          WHEN metric_type.metric = 'performance' AND wsp.performance_late THEN 'late'
          ELSE 'on_time'
        END
      WHEN metric_type.metric = 'confidence' AND (awc.week_of + interval '1 day')::timestamptz < NOW() THEN 'missing'
      WHEN metric_type.metric = 'performance' AND (awc.week_of + interval '3 days' + interval '12 hours')::timestamptz < NOW() THEN 'missing'
      ELSE 'pending'
    END as status,
    CASE 
      WHEN metric_type.metric = 'confidence' THEN (awc.week_of + interval '1 day')::timestamptz
      ELSE (awc.week_of + interval '3 days' + interval '12 hours')::timestamptz
    END as due_at,
    CASE 
      WHEN metric_type.metric = 'confidence' THEN wsc.confidence_date
      ELSE wsp.performance_date
    END as submitted_at,
    CASE 
      WHEN metric_type.metric = 'confidence' THEN COALESCE(wsc.confidence_late, false)
      ELSE COALESCE(wsp.performance_late, false)
    END as submitted_late,
    CASE
      WHEN metric_type.metric = 'confidence' AND wsc.confidence_date IS NOT NULL THEN NOT COALESCE(wsc.confidence_late, false)
      WHEN metric_type.metric = 'performance' AND wsp.performance_date IS NOT NULL THEN NOT COALESCE(wsp.performance_late, false)
      ELSE NULL
    END as on_time
  FROM assignments_with_cycle awc
  CROSS JOIN (SELECT 'confidence' as metric UNION ALL SELECT 'performance' as metric) metric_type
  CROSS JOIN (SELECT name FROM staff WHERE id = p_staff_id) s
  LEFT JOIN week_scores wsc ON date_trunc('week', awc.week_of)::date = wsc.week_of_normalized AND wsc.metric = 'confidence'
  LEFT JOIN week_scores wsp ON date_trunc('week', awc.week_of)::date = wsp.week_of_normalized AND wsp.metric = 'performance'
  WHERE awc.required = true
  ORDER BY awc.week_of DESC, awc.slot_index, metric_type.metric;
END;
$$;