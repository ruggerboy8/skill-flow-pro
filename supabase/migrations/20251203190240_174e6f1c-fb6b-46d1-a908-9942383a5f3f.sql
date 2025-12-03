-- Sync staff.coach_scope_type and coach_scope_id from coach_scopes table
-- This fixes coaches who have scopes in coach_scopes but NULL in staff table

UPDATE staff s
SET 
  coach_scope_type = cs.scope_type,
  coach_scope_id = cs.scope_id
FROM (
  SELECT DISTINCT ON (staff_id) 
    staff_id, 
    scope_type,
    scope_id
  FROM coach_scopes
  ORDER BY staff_id, created_at DESC
) cs
WHERE s.id = cs.staff_id
  AND (s.coach_scope_type IS NULL OR s.coach_scope_id IS NULL);