-- Create view to track all expected submission windows
CREATE OR REPLACE VIEW view_staff_submission_windows AS
WITH staff_locations AS (
  SELECT 
    s.id AS staff_id,
    s.name AS staff_name,
    s.role_id,
    s.primary_location_id AS location_id,
    s.hire_date,
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
    sl.*,
    weeks.week_offset,
    (DATE_TRUNC('week', (sl.program_start_date::timestamp AT TIME ZONE sl.timezone))::date + (weeks.week_offset * 7))::date AS week_of
  FROM staff_locations sl
  CROSS JOIN LATERAL (
    SELECT generate_series AS week_offset
    FROM generate_series(
      0,
      ((CURRENT_DATE - (DATE_TRUNC('week', (sl.program_start_date::timestamp AT TIME ZONE sl.timezone))::date))::integer / 7)
    )
  ) weeks
  WHERE (DATE_TRUNC('week', (sl.program_start_date::timestamp AT TIME ZONE sl.timezone))::date + (weeks.week_offset * 7))::date 
        >= COALESCE(sl.hire_date, '1900-01-01'::date) + (sl.onboarding_weeks * 7)
),
week_context AS (
  SELECT
    ws.*,
    CASE 
      WHEN ws.week_offset = 0 THEN 1
      ELSE (ws.week_offset / ws.cycle_length_weeks)::int + 1
    END AS cycle_number,
    CASE 
      WHEN ws.week_offset = 0 THEN 1
      ELSE (ws.week_offset % ws.cycle_length_weeks)::int + 1
    END AS week_in_cycle
  FROM week_series ws
),
focus_assignments AS (
  SELECT
    wc.staff_id,
    wc.staff_name,
    wc.role_id,
    wc.location_id,
    wc.week_of,
    wc.cycle_number,
    wc.week_in_cycle,
    wc.timezone,
    wf.id::text AS weekly_focus_id,
    wf.action_id,
    wf.display_order AS slot_index,
    NOT wf.self_select AS required
  FROM week_context wc
  JOIN weekly_focus wf ON wf.role_id = wc.role_id
    AND wf.cycle = wc.cycle_number
    AND wf.week_in_cycle = wc.week_in_cycle
  WHERE wc.cycle_number <= 3
),
plan_assignments AS (
  SELECT
    wc.staff_id,
    wc.staff_name,
    wc.role_id,
    wc.location_id,
    wc.week_of,
    wc.cycle_number,
    wc.week_in_cycle,
    wc.timezone,
    ('plan:' || wp.id)::text AS weekly_focus_id,
    wp.action_id,
    wp.display_order AS slot_index,
    NOT wp.self_select AS required
  FROM week_context wc
  JOIN weekly_plan wp ON wp.role_id = wc.role_id::int
    AND wp.week_start_date = wc.week_of
    AND wp.status = 'locked'
  WHERE wc.cycle_number >= 4
    AND (wp.org_id = (SELECT organization_id FROM locations WHERE id = wc.location_id)
         OR (wp.org_id IS NULL AND NOT EXISTS (
           SELECT 1 FROM weekly_plan wpo
           WHERE wpo.role_id = wc.role_id::int
             AND wpo.week_start_date = wc.week_of
             AND wpo.status = 'locked'
             AND wpo.org_id = (SELECT organization_id FROM locations WHERE id = wc.location_id)
         )))
),
all_assignments AS (
  SELECT * FROM focus_assignments
  UNION ALL
  SELECT * FROM plan_assignments
),
metric_windows AS (
  SELECT
    aa.staff_id,
    aa.staff_name,
    aa.role_id,
    aa.location_id,
    aa.week_of,
    aa.cycle_number,
    aa.week_in_cycle,
    aa.weekly_focus_id,
    aa.action_id,
    aa.slot_index,
    aa.required,
    m.metric,
    CASE 
      WHEN m.metric = 'confidence' THEN
        ((aa.week_of + 1) || ' 12:00:00 ' || aa.timezone)::timestamptz
      ELSE
        ((aa.week_of + 4) || ' 17:00:00 ' || aa.timezone)::timestamptz
    END AS due_at
  FROM all_assignments aa
  CROSS JOIN (VALUES ('confidence'), ('performance')) AS m(metric)
)
SELECT
  mw.staff_id,
  mw.staff_name,
  mw.role_id,
  mw.location_id,
  mw.week_of,
  mw.cycle_number,
  mw.week_in_cycle,
  mw.metric,
  mw.slot_index,
  mw.weekly_focus_id,
  mw.action_id,
  mw.required,
  mw.due_at,
  CASE 
    WHEN mw.metric = 'confidence' THEN ws.confidence_date
    ELSE ws.performance_date
  END AS submitted_at,
  CASE 
    WHEN mw.metric = 'confidence' THEN ws.confidence_late
    ELSE ws.performance_late
  END AS submitted_late,
  CASE 
    WHEN mw.metric = 'confidence' THEN 
      ws.confidence_date IS NOT NULL AND NOT COALESCE(ws.confidence_late, false)
    ELSE 
      ws.performance_date IS NOT NULL AND NOT COALESCE(ws.performance_late, false)
  END AS on_time,
  CASE
    WHEN mw.metric = 'confidence' AND ws.confidence_date IS NOT NULL AND NOT COALESCE(ws.confidence_late, false) THEN 'on_time'
    WHEN mw.metric = 'confidence' AND ws.confidence_date IS NOT NULL AND ws.confidence_late THEN 'late'
    WHEN mw.metric = 'performance' AND ws.performance_date IS NOT NULL AND NOT COALESCE(ws.performance_late, false) THEN 'on_time'
    WHEN mw.metric = 'performance' AND ws.performance_date IS NOT NULL AND ws.performance_late THEN 'late'
    WHEN (mw.metric = 'confidence' AND ws.confidence_date IS NULL AND NOW() > mw.due_at)
      OR (mw.metric = 'performance' AND ws.performance_date IS NULL AND NOW() > mw.due_at) THEN 'missing'
    ELSE 'pending'
  END AS status
FROM metric_windows mw
LEFT JOIN weekly_scores ws ON ws.staff_id = mw.staff_id 
  AND ws.weekly_focus_id = mw.weekly_focus_id;

COMMENT ON VIEW view_staff_submission_windows IS 
  'Enumerates all expected submissions (confidence & performance) for each staff member and week, including missing submissions after due date.';

-- Create RPC function with proper access control
CREATE OR REPLACE FUNCTION get_staff_submission_windows(
  p_staff_id uuid,
  p_since date DEFAULT NULL
)
RETURNS TABLE (
  week_of date,
  cycle integer,
  week_in_cycle integer,
  metric text,
  slot_index integer,
  action_id bigint,
  required boolean,
  due_at timestamptz,
  submitted_at timestamptz,
  status text,
  on_time boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Enforce access control: staff can view their own, coaches can view their staff
  IF NOT (
    EXISTS (SELECT 1 FROM staff WHERE id = p_staff_id AND user_id = auth.uid())
    OR is_coach_or_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    v.week_of,
    v.cycle_number,
    v.week_in_cycle,
    v.metric,
    v.slot_index,
    v.action_id,
    v.required,
    v.due_at,
    v.submitted_at,
    v.status,
    v.on_time
  FROM view_staff_submission_windows v
  WHERE v.staff_id = p_staff_id
    AND (p_since IS NULL OR v.due_at >= p_since::timestamptz)
  ORDER BY v.due_at DESC;
END;
$$;

COMMENT ON FUNCTION get_staff_submission_windows IS 
  'Returns submission windows for a staff member. Properly counts missing submissions in on-time rate. p_since filters by due_at (NULL = all time).';

GRANT EXECUTE ON FUNCTION get_staff_submission_windows TO authenticated;

-- Basic smoke test
DO $$
DECLARE
  test_count integer;
BEGIN
  SELECT COUNT(*) INTO test_count FROM view_staff_submission_windows LIMIT 100;
  RAISE NOTICE 'Submission windows view created. Sample rows: %', test_count;
END $$;