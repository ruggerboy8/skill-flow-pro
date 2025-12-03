-- Fix orphan backfill scores by populating their assignment_id
-- These scores were created before the weekly_assignments system existed
-- and need to be linked to the corresponding assignment records

UPDATE weekly_scores ws
SET assignment_id = 'assign:' || wa.id
FROM weekly_focus wf, staff s, weekly_assignments wa
WHERE ws.weekly_focus_id = wf.id::text
  AND s.id = ws.staff_id
  AND wa.week_start_date = wf.week_start_date
  AND wa.action_id = wf.action_id
  AND wa.role_id = s.role_id
  AND wa.location_id = s.primary_location_id
  AND wa.status = 'locked'
  AND ws.assignment_id IS NULL
  AND ws.confidence_source = 'backfill_historical';