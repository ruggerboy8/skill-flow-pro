-- Step 1: Fix existing data - Update scores to reference the correct week's assignment_id
-- This handles cases where the same pro move was repeated in multiple weeks

UPDATE weekly_scores ws
SET assignment_id = 'assign:' || correct_wa.id::text
FROM weekly_assignments correct_wa
WHERE 
  -- Only update scores that have an assignment_id
  ws.assignment_id IS NOT NULL
  AND ws.assignment_id LIKE 'assign:%'
  -- Get the staff's location and role from the old assignment
  AND EXISTS (
    SELECT 1
    FROM weekly_assignments old_wa
    JOIN staff s ON s.id = ws.staff_id
    WHERE old_wa.id::text = REPLACE(ws.assignment_id, 'assign:', '')
    AND correct_wa.role_id = old_wa.role_id
    AND correct_wa.action_id = old_wa.action_id
    AND (
      -- Match by location if both have location
      (correct_wa.location_id = s.primary_location_id AND old_wa.location_id IS NOT NULL)
      -- Match by org if old was org-level and new is org-level
      OR (correct_wa.org_id = (SELECT organization_id FROM locations WHERE id = s.primary_location_id) 
          AND old_wa.org_id IS NOT NULL AND correct_wa.location_id IS NULL)
      -- Match if both are global
      OR (correct_wa.org_id IS NULL AND correct_wa.location_id IS NULL 
          AND old_wa.org_id IS NULL AND old_wa.location_id IS NULL)
    )
  )
  -- Match the correct week's assignment
  AND correct_wa.week_start_date = ws.week_of
  AND correct_wa.status = 'locked';