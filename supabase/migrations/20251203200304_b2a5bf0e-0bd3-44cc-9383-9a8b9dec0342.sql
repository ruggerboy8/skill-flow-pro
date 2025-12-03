-- Direct fix: Update week_of for all backfill_historical scores to match their linked assignment
-- Using a simpler approach with explicit JOIN

WITH score_fixes AS (
  SELECT 
    ws.id as score_id,
    wa.week_start_date as correct_week
  FROM weekly_scores ws
  INNER JOIN weekly_assignments wa ON ws.assignment_id = 'assign:' || wa.id::text
  WHERE ws.confidence_source = 'backfill_historical'
    AND ws.week_of != wa.week_start_date
)
UPDATE weekly_scores
SET week_of = sf.correct_week
FROM score_fixes sf
WHERE weekly_scores.id = sf.score_id;