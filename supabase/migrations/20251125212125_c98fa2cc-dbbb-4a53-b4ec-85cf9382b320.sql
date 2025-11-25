-- Fix hire date filtering in view_staff_submission_windows and get_staff_all_weekly_scores
-- This ensures staff are only held accountable for weeks after their hire date

-- 1. Drop and recreate view_staff_submission_windows with hire_date filter
DROP VIEW IF EXISTS view_staff_submission_windows CASCADE;

CREATE VIEW view_staff_submission_windows AS
WITH base_staff AS (
  SELECT 
    s.id AS staff_id,
    s.name AS staff_name,
    s.role_id,
    s.primary_location_id AS location_id,
    s.hire_date,  -- Added hire_date
    l.program_start_date,
    l.cycle_length_weeks,
    l.timezone
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.is_participant = true
),
assignment_weeks AS (
  SELECT DISTINCT week_start_date
  FROM weekly_assignments
  WHERE status = 'locked' AND superseded_at IS NULL
),
staff_weeks AS (
  SELECT 
    bs.staff_id,
    bs.staff_name,
    bs.role_id,
    bs.location_id,
    bs.program_start_date,
    bs.cycle_length_weeks,
    bs.timezone,
    aw.week_start_date AS week_of
  FROM base_staff bs
  CROSS JOIN assignment_weeks aw
  WHERE aw.week_start_date >= bs.hire_date  -- Added hire_date filter
),
week_context AS (
  SELECT 
    sw.staff_id,
    sw.staff_name,
    sw.role_id,
    sw.location_id,
    sw.program_start_date,
    sw.cycle_length_weeks,
    sw.timezone,
    sw.week_of,
    GREATEST(0, (sw.week_of - DATE_TRUNC('week', sw.program_start_date::timestamp AT TIME ZONE sw.timezone)::date) / 7) AS week_index
  FROM staff_weeks sw
),
cycle_calc AS (
  SELECT 
    wc.staff_id,
    wc.staff_name,
    wc.role_id,
    wc.location_id,
    wc.program_start_date,
    wc.cycle_length_weeks,
    wc.timezone,
    wc.week_of,
    wc.week_index,
    CASE WHEN wc.week_index = 0 THEN 1 ELSE wc.week_index / wc.cycle_length_weeks + 1 END AS cycle_number,
    CASE WHEN wc.week_index = 0 THEN 1 ELSE wc.week_index % wc.cycle_length_weeks + 1 END AS week_in_cycle
  FROM week_context wc
),
assignments_data AS (
  SELECT 
    cc.staff_id,
    cc.staff_name,
    cc.role_id,
    cc.location_id,
    cc.week_of,
    cc.cycle_number,
    cc.week_in_cycle,
    cc.timezone,
    wa.id AS assignment_id,
    wa.action_id,
    wa.self_select AS is_self_select,
    wa.display_order AS slot_index,
    NOT wa.self_select AS required
  FROM cycle_calc cc
  JOIN weekly_assignments wa ON 
    wa.role_id = cc.role_id::int
    AND wa.week_start_date = cc.week_of
    AND wa.status = 'locked'
    AND wa.superseded_at IS NULL
    AND (
      wa.location_id = cc.location_id
      OR (wa.org_id IS NOT NULL AND wa.location_id IS NULL AND EXISTS (
        SELECT 1 FROM locations l2 WHERE l2.id = cc.location_id AND l2.organization_id = wa.org_id
      ))
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
  LEFT JOIN weekly_scores ws ON 
    ws.staff_id = ad.staff_id 
    AND ws.assignment_id = 'assign:' || ad.assignment_id::text
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
  LEFT JOIN weekly_scores ws ON 
    ws.staff_id = ad.staff_id 
    AND ws.assignment_id = 'assign:' || ad.assignment_id::text
)
SELECT 
  cd.staff_id,
  cd.staff_name,
  cd.week_of,
  cd.cycle_number,
  cd.week_in_cycle,
  cd.action_id,
  cd.is_self_select,
  cd.slot_index,
  cd.role_id,
  cd.location_id,
  'confidence' AS metric,
  cd.due_at,
  CASE 
    WHEN cd.confidence_score IS NOT NULL THEN 'submitted'
    WHEN NOW() > cd.due_at THEN 'missing'
    ELSE 'pending'
  END AS status,
  cd.required,
  cd.submitted_at,
  cd.submitted_late,
  CASE 
    WHEN cd.submitted_at IS NOT NULL THEN cd.submitted_at <= cd.due_at
    ELSE NULL
  END AS on_time
FROM conf_data cd

UNION ALL

SELECT 
  pd.staff_id,
  pd.staff_name,
  pd.week_of,
  pd.cycle_number,
  pd.week_in_cycle,
  pd.action_id,
  pd.is_self_select,
  pd.slot_index,
  pd.role_id,
  pd.location_id,
  'performance' AS metric,
  pd.due_at,
  CASE 
    WHEN pd.performance_score IS NOT NULL THEN 'submitted'
    WHEN NOW() > pd.due_at THEN 'missing'
    ELSE 'pending'
  END AS status,
  pd.required,
  pd.submitted_at,
  pd.submitted_late,
  CASE 
    WHEN pd.submitted_at IS NOT NULL THEN pd.submitted_at <= pd.due_at
    ELSE NULL
  END AS on_time
FROM perf_data pd;

-- 2. Drop and recreate get_staff_all_weekly_scores to filter by hire_date
DROP FUNCTION IF EXISTS get_staff_all_weekly_scores(uuid);

CREATE FUNCTION get_staff_all_weekly_scores(p_staff_id uuid)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  staff_email text,
  user_id uuid,
  role_id int,
  role_name text,
  location_id uuid,
  location_name text,
  organization_id uuid,
  organization_name text,
  week_of date,
  action_id int,
  action_statement text,
  domain_id int,
  domain_name text,
  confidence_score int,
  performance_score int,
  confidence_date timestamptz,
  performance_date timestamptz,
  confidence_late boolean,
  performance_late boolean,
  is_self_select boolean,
  display_order int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH staff_info AS (
    SELECT 
      s.id,
      s.name,
      s.email,
      s.user_id,
      s.role_id,
      s.primary_location_id,
      s.hire_date,
      r.role_name,
      l.name AS loc_name,
      l.organization_id AS org_id,
      o.name AS org_name
    FROM staff s
    LEFT JOIN roles r ON s.role_id = r.role_id
    LEFT JOIN locations l ON s.primary_location_id = l.id
    LEFT JOIN organizations o ON l.organization_id = o.id
    WHERE s.id = p_staff_id
  ),
  assignment_scores AS (
    SELECT 
      si.id AS staff_id,
      si.name AS staff_name,
      si.email AS staff_email,
      si.user_id,
      si.role_id,
      si.role_name,
      si.primary_location_id AS location_id,
      si.loc_name AS location_name,
      si.org_id AS organization_id,
      si.org_name AS organization_name,
      wa.week_start_date AS week_of,
      wa.action_id,
      pm.action_statement,
      c.domain_id,
      d.domain_name,
      ws.confidence_score,
      ws.performance_score,
      ws.confidence_date,
      ws.performance_date,
      ws.confidence_late,
      ws.performance_late,
      wa.self_select AS is_self_select,
      wa.display_order
    FROM staff_info si
    INNER JOIN weekly_assignments wa ON 
      wa.role_id = si.role_id
      AND wa.status = 'active'
      AND (wa.location_id = si.primary_location_id OR wa.location_id IS NULL)
      AND wa.week_start_date >= si.hire_date  -- Only weeks after hire date
    LEFT JOIN pro_moves pm ON wa.action_id = pm.action_id
    LEFT JOIN competencies c ON pm.competency_id = c.competency_id
    LEFT JOIN domains d ON c.domain_id = d.domain_id
    LEFT JOIN weekly_scores ws ON 
      ws.staff_id = si.id
      AND ws.week_of = wa.week_start_date
      AND ws.assignment_id = wa.id
  ),
  focus_scores AS (
    SELECT 
      si.id AS staff_id,
      si.name AS staff_name,
      si.email AS staff_email,
      si.user_id,
      si.role_id,
      si.role_name,
      si.primary_location_id AS location_id,
      si.loc_name AS location_name,
      si.org_id AS organization_id,
      si.org_name AS organization_name,
      wf.week_start_date AS week_of,
      wf.action_id,
      pm.action_statement,
      c.domain_id,
      d.domain_name,
      ws.confidence_score,
      ws.performance_score,
      ws.confidence_date,
      ws.performance_date,
      ws.confidence_late,
      ws.performance_late,
      wf.self_select AS is_self_select,
      wf.display_order
    FROM staff_info si
    INNER JOIN weekly_focus wf ON 
      wf.role_id = si.role_id
      AND wf.week_start_date >= si.hire_date  -- Only weeks after hire date
    LEFT JOIN pro_moves pm ON wf.action_id = pm.action_id
    LEFT JOIN competencies c ON pm.competency_id = c.competency_id
    LEFT JOIN domains d ON c.domain_id = d.domain_id
    INNER JOIN weekly_scores ws ON 
      ws.staff_id = si.id
      AND ws.week_of = wf.week_start_date
      AND ws.weekly_focus_id = wf.id
    WHERE NOT EXISTS (
      SELECT 1 
      FROM weekly_assignments wa2 
      WHERE wa2.week_start_date = wf.week_start_date
        AND wa2.role_id = si.role_id
        AND wa2.status = 'active'
        AND (wa2.location_id = si.primary_location_id OR wa2.location_id IS NULL)
    )
  )
  SELECT * FROM assignment_scores
  UNION ALL
  SELECT * FROM focus_scores
  ORDER BY week_of DESC, display_order;
END;
$$;