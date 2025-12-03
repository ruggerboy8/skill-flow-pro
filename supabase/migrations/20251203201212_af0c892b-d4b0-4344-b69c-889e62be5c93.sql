
-- Direct UPDATE to fix week_of for backfill_historical scores
UPDATE weekly_scores ws
SET week_of = wa.week_start_date
FROM weekly_assignments wa
WHERE ws.assignment_id = 'assign:' || wa.id::text
  AND ws.confidence_source = 'backfill_historical'
  AND ws.week_of = '2025-12-01'
  AND wa.week_start_date != '2025-12-01';
