
-- Fix view_staff_submission_windows to include weeks where staff was hired mid-week
-- Same fix as get_staff_all_weekly_scores: check if hire_date falls within the week (Mon-Sun)

CREATE OR REPLACE VIEW view_staff_submission_windows AS
WITH base_staff AS (
  SELECT 
    s.id AS staff_id,
    s.name AS staff_name,
    s.role_id,
    s.primary_location_id AS location_id,
    s.hire_date,
    s.participation_start_at,
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
  -- FIX: Include weeks where hire_date falls within the week (Mon-Sun)
  WHERE COALESCE(bs.participation_start_at::date, bs.hire_date) <= (aw.week_start_date + INTERVAL '6 days')::date
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
    GREATEST(0, (sw.week_of - date_trunc('week', sw.program_start_date AT TIME ZONE sw.timezone)::date) / 7) AS week_index
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
  JOIN weekly_assignments wa 
    ON wa.role_id = cc.role_id 
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
    (ad.week_of + INTERVAL '1 day' + INTERVAL '12 hours') AT TIME ZONE ad.timezone AS due_at
  FROM assignments_data ad
  LEFT JOIN weekly_scores ws 
    ON ws.staff_id = ad.staff_id 
    AND ws.assignment_id = 'assign:' || ad.assignment_id
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
    (ad.week_of + INTERVAL '4 days' + INTERVAL '17 hours') AT TIME ZONE ad.timezone AS due_at
  FROM assignments_data ad
  LEFT JOIN weekly_scores ws 
    ON ws.staff_id = ad.staff_id 
    AND ws.assignment_id = 'assign:' || ad.assignment_id
)
SELECT 
  cd.staff_id,
  cd.staff_name,
  cd.week_of,
  cd.cycle_number,
  cd.week_in_cycle,
  cd.slot_index,
  cd.action_id,
  cd.is_self_select,
  'confidence'::text AS metric,
  CASE 
    WHEN cd.confidence_score IS NOT NULL THEN 'submitted'
    ELSE 'missing'
  END AS status,
  cd.submitted_at,
  cd.submitted_late,
  cd.due_at,
  CASE 
    WHEN cd.confidence_score IS NOT NULL AND NOT COALESCE(cd.submitted_late, false) THEN true
    ELSE false
  END AS on_time,
  cd.required,
  cd.location_id,
  cd.role_id
FROM conf_data cd

UNION ALL

SELECT 
  pd.staff_id,
  pd.staff_name,
  pd.week_of,
  pd.cycle_number,
  pd.week_in_cycle,
  pd.slot_index,
  pd.action_id,
  pd.is_self_select,
  'performance'::text AS metric,
  CASE 
    WHEN pd.performance_score IS NOT NULL THEN 'submitted'
    ELSE 'missing'
  END AS status,
  pd.submitted_at,
  pd.submitted_late,
  pd.due_at,
  CASE 
    WHEN pd.performance_score IS NOT NULL AND NOT COALESCE(pd.submitted_late, false) THEN true
    ELSE false
  END AS on_time,
  pd.required,
  pd.location_id,
  pd.role_id
FROM perf_data pd;
