-- One-time data correction: Update all confidence_late and performance_late flags
-- based on assignment week deadlines

UPDATE weekly_scores ws
SET 
  confidence_late = CASE 
    WHEN ws.confidence_date IS NULL THEN NULL
    WHEN ws.assignment_id IS NOT NULL AND ws.assignment_id LIKE 'assign:%' THEN
      ws.confidence_date > (
        (SELECT wa.week_start_date FROM weekly_assignments wa 
         WHERE ('assign:' || wa.id) = ws.assignment_id)
        + INTERVAL '1 day 23 hours 59 minutes 59 seconds'
      )
    ELSE ws.confidence_late -- Leave unchanged if not an assignment-based score
  END,
  performance_late = CASE 
    WHEN ws.performance_date IS NULL THEN NULL
    WHEN ws.assignment_id IS NOT NULL AND ws.assignment_id LIKE 'assign:%' THEN
      ws.performance_date > (
        (SELECT wa.week_start_date FROM weekly_assignments wa 
         WHERE ('assign:' || wa.id) = ws.assignment_id)
        + INTERVAL '4 days 23 hours 59 minutes 59 seconds'
      )
    ELSE ws.performance_late -- Leave unchanged if not an assignment-based score
  END
WHERE ws.assignment_id IS NOT NULL AND ws.assignment_id LIKE 'assign:%';