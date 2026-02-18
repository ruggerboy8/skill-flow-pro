
-- Phase 2: Add per-location deadline columns
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS conf_due_day smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS conf_due_time time NOT NULL DEFAULT '14:00:00',
  ADD COLUMN IF NOT EXISTS perf_due_day smallint NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS perf_due_time time NOT NULL DEFAULT '17:00:00';

-- Add check constraints for valid day offsets
ALTER TABLE public.locations
  ADD CONSTRAINT chk_conf_due_day CHECK (conf_due_day BETWEEN 0 AND 6),
  ADD CONSTRAINT chk_perf_due_day CHECK (perf_due_day BETWEEN 0 AND 6);

-- Update view_staff_submission_windows to use per-location deadline columns
CREATE OR REPLACE VIEW public.view_staff_submission_windows AS
WITH base_staff AS (
  SELECT s.id AS staff_id,
    s.name AS staff_name,
    s.role_id,
    s.primary_location_id AS location_id,
    s.hire_date,
    s.participation_start_at,
    l.program_start_date,
    l.cycle_length_weeks,
    l.timezone,
    l.conf_due_day,
    l.conf_due_time,
    l.perf_due_day,
    l.perf_due_time
  FROM staff s
    JOIN locations l ON l.id = s.primary_location_id
  WHERE s.is_participant = true AND s.is_paused = false
), assignment_weeks AS (
  SELECT DISTINCT weekly_assignments.week_start_date
  FROM weekly_assignments
  WHERE weekly_assignments.status = 'locked'::text AND weekly_assignments.superseded_at IS NULL
), staff_weeks AS (
  SELECT bs.staff_id,
    bs.staff_name,
    bs.role_id,
    bs.location_id,
    bs.program_start_date,
    bs.cycle_length_weeks,
    bs.timezone,
    bs.conf_due_day,
    bs.conf_due_time,
    bs.perf_due_day,
    bs.perf_due_time,
    aw.week_start_date AS week_of
  FROM base_staff bs
    CROSS JOIN assignment_weeks aw
  WHERE COALESCE(bs.participation_start_at::date, bs.hire_date) <= (aw.week_start_date + '6 days'::interval)::date
), week_context AS (
  SELECT sw.staff_id,
    sw.staff_name,
    sw.role_id,
    sw.location_id,
    sw.program_start_date,
    sw.cycle_length_weeks,
    sw.timezone,
    sw.conf_due_day,
    sw.conf_due_time,
    sw.perf_due_day,
    sw.perf_due_time,
    sw.week_of,
    GREATEST(0, (sw.week_of - date_trunc('week'::text, (sw.program_start_date AT TIME ZONE sw.timezone))::date) / 7) AS week_index
  FROM staff_weeks sw
), cycle_calc AS (
  SELECT wc.staff_id,
    wc.staff_name,
    wc.role_id,
    wc.location_id,
    wc.program_start_date,
    wc.cycle_length_weeks,
    wc.timezone,
    wc.conf_due_day,
    wc.conf_due_time,
    wc.perf_due_day,
    wc.perf_due_time,
    wc.week_of,
    wc.week_index,
    CASE
      WHEN wc.week_index = 0 THEN 1
      ELSE wc.week_index / wc.cycle_length_weeks + 1
    END AS cycle_number,
    CASE
      WHEN wc.week_index = 0 THEN 1
      ELSE wc.week_index % wc.cycle_length_weeks + 1
    END AS week_in_cycle
  FROM week_context wc
), assignments_data AS (
  SELECT cc.staff_id,
    cc.staff_name,
    cc.role_id,
    cc.location_id,
    cc.week_of,
    cc.cycle_number,
    cc.week_in_cycle,
    cc.timezone,
    cc.conf_due_day,
    cc.conf_due_time,
    cc.perf_due_day,
    cc.perf_due_time,
    wa.id AS assignment_id,
    wa.action_id,
    wa.self_select AS is_self_select,
    wa.display_order AS slot_index,
    NOT wa.self_select AS required
  FROM cycle_calc cc
    JOIN weekly_assignments wa ON wa.role_id = cc.role_id AND wa.week_start_date = cc.week_of AND wa.status = 'locked'::text AND wa.superseded_at IS NULL AND (wa.location_id = cc.location_id OR wa.org_id IS NOT NULL AND wa.location_id IS NULL AND (EXISTS ( SELECT 1
          FROM locations l2
         WHERE l2.id = cc.location_id AND l2.organization_id = wa.org_id)) OR wa.org_id IS NULL AND wa.location_id IS NULL)
), conf_data AS (
  SELECT ad.staff_id,
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
    ad.timezone,
    ws.confidence_score,
    ws.confidence_date AS submitted_at,
    ws.confidence_late AS submitted_late,
    ((ad.week_of + (ad.conf_due_day || ' days')::interval + ad.conf_due_time) AT TIME ZONE ad.timezone) AS due_at
  FROM assignments_data ad
    LEFT JOIN weekly_scores ws ON ws.staff_id = ad.staff_id AND ws.assignment_id = ('assign:'::text || ad.assignment_id)
), perf_data AS (
  SELECT ad.staff_id,
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
    ad.timezone,
    ws.performance_score,
    ws.performance_date AS submitted_at,
    ws.performance_late AS submitted_late,
    ((ad.week_of + (ad.perf_due_day || ' days')::interval + ad.perf_due_time) AT TIME ZONE ad.timezone) AS due_at
  FROM assignments_data ad
    LEFT JOIN weekly_scores ws ON ws.staff_id = ad.staff_id AND ws.assignment_id = ('assign:'::text || ad.assignment_id)
)
SELECT cd.staff_id,
  cd.staff_name,
  cd.role_id,
  cd.location_id,
  cd.week_of,
  cd.cycle_number,
  cd.week_in_cycle,
  cd.action_id,
  cd.is_self_select,
  cd.slot_index,
  cd.required,
  'confidence'::text AS metric,
  CASE
    WHEN cd.confidence_score IS NOT NULL THEN 'submitted'::text
    WHEN (now() AT TIME ZONE cd.timezone) > cd.due_at THEN 'missing'::text
    ELSE 'pending'::text
  END AS status,
  cd.submitted_at,
  cd.submitted_late,
  cd.due_at,
  CASE
    WHEN cd.confidence_score IS NOT NULL AND COALESCE(cd.submitted_late, false) = false THEN true
    WHEN cd.confidence_score IS NOT NULL THEN false
    ELSE NULL::boolean
  END AS on_time
FROM conf_data cd
WHERE cd.required = true
UNION ALL
SELECT pd.staff_id,
  pd.staff_name,
  pd.role_id,
  pd.location_id,
  pd.week_of,
  pd.cycle_number,
  pd.week_in_cycle,
  pd.action_id,
  pd.is_self_select,
  pd.slot_index,
  pd.required,
  'performance'::text AS metric,
  CASE
    WHEN pd.performance_score IS NOT NULL THEN 'submitted'::text
    WHEN (now() AT TIME ZONE pd.timezone) > pd.due_at THEN 'missing'::text
    ELSE 'pending'::text
  END AS status,
  pd.submitted_at,
  pd.submitted_late,
  pd.due_at,
  CASE
    WHEN pd.performance_score IS NOT NULL AND COALESCE(pd.submitted_late, false) = false THEN true
    WHEN pd.performance_score IS NOT NULL THEN false
    ELSE NULL::boolean
  END AS on_time
FROM perf_data pd
WHERE pd.required = true;
