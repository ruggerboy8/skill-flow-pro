-- Fix incorrect week_of values on backfill scores
-- The INSERT used wrong week_of, need to correct it to match the assignment's week_start_date

UPDATE weekly_scores ws
SET week_of = wa.week_start_date
FROM weekly_assignments wa
WHERE ws.assignment_id = 'assign:' || wa.id
  AND ws.confidence_source = 'backfill_historical'
  AND ws.week_of != wa.week_start_date;