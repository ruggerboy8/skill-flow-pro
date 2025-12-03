-- Fix: Delete incorrectly inserted scores and re-insert with correct assignment linking
-- Step 1: Delete the scores that have wrong week_of (inserted by our buggy migration)
DELETE FROM weekly_scores
WHERE confidence_source = 'backfill_historical'
  AND week_of = '2025-12-01'
  AND assignment_id LIKE 'assign:%';

-- Step 2: Re-insert with correct logic - match assignments by week_start_date range
WITH score_lookup AS (
  SELECT 19 as action_id, 2 as conf, 3 as perf UNION ALL SELECT 20, 2, 3 UNION ALL SELECT 21, 3, 3 UNION ALL
  SELECT 22, 2, 3 UNION ALL SELECT 23, 1, 2 UNION ALL SELECT 24, 2, 3 UNION ALL SELECT 25, 2, 3 UNION ALL
  SELECT 26, 2, 2 UNION ALL SELECT 27, 1, 2 UNION ALL SELECT 28, 2, 2 UNION ALL SELECT 29, 3, 3 UNION ALL
  SELECT 30, 2, 3 UNION ALL SELECT 31, 2, 2 UNION ALL SELECT 32, 3, 3 UNION ALL SELECT 33, 2, 3 UNION ALL SELECT 34, 2, 3
),
target_locations AS (
  SELECT id FROM locations WHERE slug IN ('buda', 'south-austin', 'kyle', 'mckinney', 'frisco')
),
missing_scores AS (
  SELECT wa.id as assignment_id, wa.week_start_date, wa.action_id, s.id as staff_id, s.user_id, sl.conf, sl.perf
  FROM weekly_assignments wa
  JOIN target_locations tl ON wa.location_id = tl.id
  JOIN staff s ON s.primary_location_id = wa.location_id AND s.role_id = wa.role_id AND s.is_participant = true
  JOIN score_lookup sl ON sl.action_id = wa.action_id
  WHERE wa.week_start_date >= '2025-07-21' AND wa.week_start_date <= '2025-08-25'
    AND wa.status = 'locked' AND wa.source = 'onboarding'
    AND wa.week_start_date >= COALESCE(s.participation_start_at::date, s.hire_date)
    AND NOT EXISTS (SELECT 1 FROM weekly_scores ws WHERE ws.staff_id = s.id AND ws.assignment_id = 'assign:' || wa.id)
)
INSERT INTO weekly_scores (staff_id, assignment_id, week_of, confidence_score, confidence_date, confidence_late, confidence_source, performance_score, performance_date, performance_late, performance_source, entered_by)
SELECT staff_id, 'assign:' || assignment_id, week_start_date, conf,
  (week_start_date + INTERVAL '10 hours')::timestamptz, false, 'backfill_historical',
  perf, (week_start_date + INTERVAL '3 days 10 hours')::timestamptz, false, 'backfill_historical', user_id
FROM missing_scores;