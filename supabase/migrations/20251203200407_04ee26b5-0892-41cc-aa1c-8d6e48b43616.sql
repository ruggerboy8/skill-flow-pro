-- Simple direct UPDATE without CTE
UPDATE weekly_scores 
SET week_of = (
  SELECT wa.week_start_date 
  FROM weekly_assignments wa 
  WHERE weekly_scores.assignment_id = 'assign:' || wa.id::text
  LIMIT 1
)
WHERE confidence_source = 'backfill_historical'
  AND assignment_id LIKE 'assign:%';