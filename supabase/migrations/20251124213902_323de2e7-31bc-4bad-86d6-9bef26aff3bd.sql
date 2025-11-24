-- One-time data correction: Update late flags based on new deadlines
-- Confidence late: Tuesday 3:00 PM (week_start_date + 1 day 15 hours)
-- Performance late: Friday 5:00 PM (week_start_date + 4 days 17 hours)

UPDATE weekly_scores ws
SET 
  confidence_late = CASE 
    WHEN ws.confidence_date IS NOT NULL AND wa.week_start_date IS NOT NULL THEN
      ws.confidence_date > (wa.week_start_date + INTERVAL '1 day 15 hours')
    ELSE NULL
  END,
  performance_late = CASE 
    WHEN ws.performance_date IS NOT NULL AND wa.week_start_date IS NOT NULL THEN
      ws.performance_date > (wa.week_start_date + INTERVAL '4 days 17 hours')
    ELSE NULL
  END
FROM weekly_assignments wa
WHERE ws.assignment_id = ('assign:' || wa.id)
  AND (ws.confidence_date IS NOT NULL OR ws.performance_date IS NOT NULL);