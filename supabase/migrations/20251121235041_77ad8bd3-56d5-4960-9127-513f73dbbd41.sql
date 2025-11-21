-- Step 2: More comprehensive fix - Match any assignment with same action+role for the score's week
UPDATE weekly_scores ws
SET assignment_id = 'assign:' || correct_wa.id::text
FROM weekly_assignments correct_wa,
     weekly_assignments old_wa,
     staff s
WHERE 
  -- Current state: score references old assignment
  ws.assignment_id = 'assign:' || old_wa.id::text
  AND ws.staff_id = s.id
  -- Find correct assignment: same action, role, and matches score's week_of
  AND correct_wa.action_id = old_wa.action_id
  AND correct_wa.role_id = old_wa.role_id
  AND correct_wa.week_start_date = ws.week_of
  AND correct_wa.status = 'locked'
  -- Prefer location-specific > org-specific > global (in that order)
  AND (
    correct_wa.location_id = s.primary_location_id
    OR (correct_wa.location_id IS NULL AND correct_wa.org_id = (SELECT organization_id FROM locations WHERE id = s.primary_location_id))
    OR (correct_wa.location_id IS NULL AND correct_wa.org_id IS NULL)
  )
  -- Only update where there's a mismatch
  AND ws.week_of != old_wa.week_start_date;