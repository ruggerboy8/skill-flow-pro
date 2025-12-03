-- Fix incorrect week_of values on backfill scores (attempt 2)
-- Update scores where week_of doesn't match the linked assignment's week_start_date

UPDATE weekly_scores ws
SET week_of = sub.correct_week
FROM (
  SELECT ws2.id as score_id, wa.week_start_date as correct_week
  FROM weekly_scores ws2
  JOIN weekly_assignments wa ON ws2.assignment_id = 'assign:' || wa.id::text
  WHERE ws2.confidence_source = 'backfill_historical'
    AND ws2.week_of != wa.week_start_date
) sub
WHERE ws.id = sub.score_id;