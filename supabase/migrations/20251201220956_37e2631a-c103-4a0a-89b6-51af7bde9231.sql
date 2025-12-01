-- Complete Phase 1.2: Insert remaining missing onboarding assignments
-- Focus on generating any gaps that were missed

INSERT INTO weekly_assignments (
  week_start_date,
  role_id,
  location_id,
  org_id,
  source,
  status,
  display_order,
  action_id,
  competency_id,
  self_select,
  legacy_focus_id
)
SELECT DISTINCT
  (l.program_start_date + ((wf.cycle - 1) * l.cycle_length_weeks * 7 + (wf.week_in_cycle - 1) * 7) * INTERVAL '1 day')::date as week_start_date,
  wf.role_id,
  l.id as location_id,
  NULL::uuid as org_id,
  'onboarding' as source,
  'locked' as status,
  wf.display_order,
  wf.action_id,
  wf.competency_id,
  wf.self_select,
  wf.id as legacy_focus_id
FROM weekly_focus wf
CROSS JOIN locations l
WHERE l.active = true
  AND l.onboarding_active = true
  AND wf.cycle BETWEEN 1 AND 3
  AND NOT EXISTS (
    SELECT 1 FROM weekly_assignments wa2
    WHERE wa2.week_start_date = (l.program_start_date + ((wf.cycle - 1) * l.cycle_length_weeks * 7 + (wf.week_in_cycle - 1) * 7) * INTERVAL '1 day')::date
      AND wa2.location_id = l.id
      AND wa2.role_id = wf.role_id
      AND wa2.source = 'onboarding'
      AND wa2.display_order = wf.display_order
  )
ON CONFLICT DO NOTHING;