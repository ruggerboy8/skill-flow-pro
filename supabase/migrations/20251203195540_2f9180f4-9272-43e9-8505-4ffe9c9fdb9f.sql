-- Backfill missing weekly_scores for affected staff at Buda, South Austin, Kyle, McKinney, Frisco
-- Period: 2025-07-21 to 2025-08-25
-- Scores use role-specific averages provided by user
-- Submission dates set to Monday (confidence) and Thursday (performance) to ensure on-time

WITH score_lookup AS (
  -- DFI Pro Moves (role_id = 1)
  SELECT 1 as action_id, 2 as conf, 3 as perf UNION ALL
  SELECT 2, 2, 3 UNION ALL
  SELECT 3, 1, 2 UNION ALL
  SELECT 4, 2, 2 UNION ALL
  SELECT 5, 2, 3 UNION ALL
  SELECT 6, 2, 2 UNION ALL
  SELECT 8, 3, 3 UNION ALL
  SELECT 9, 1, 2 UNION ALL
  SELECT 10, 2, 2 UNION ALL
  SELECT 11, 2, 3 UNION ALL
  SELECT 12, 3, 3 UNION ALL
  SELECT 13, 3, 3 UNION ALL
  SELECT 14, 2, 3 UNION ALL
  SELECT 15, 1, 2 UNION ALL
  SELECT 16, 3, 3 UNION ALL
  SELECT 17, 2, 2 UNION ALL
  SELECT 18, 2, 2 UNION ALL
  -- RDA Pro Moves (role_id = 2)
  SELECT 19, 2, 3 UNION ALL
  SELECT 20, 2, 3 UNION ALL
  SELECT 21, 3, 3 UNION ALL
  SELECT 22, 2, 3 UNION ALL
  SELECT 23, 1, 2 UNION ALL
  SELECT 24, 2, 3 UNION ALL
  SELECT 25, 2, 3 UNION ALL
  SELECT 26, 2, 2 UNION ALL
  SELECT 27, 1, 2 UNION ALL
  SELECT 28, 2, 2 UNION ALL
  SELECT 29, 3, 3 UNION ALL
  SELECT 30, 2, 3 UNION ALL
  SELECT 31, 2, 2 UNION ALL
  SELECT 32, 3, 3 UNION ALL
  SELECT 33, 2, 3 UNION ALL
  SELECT 34, 2, 3
),
target_locations AS (
  SELECT id FROM locations 
  WHERE slug IN ('buda', 'south-austin', 'kyle', 'mckinney', 'frisco')
),
missing_scores AS (
  SELECT 
    wa.id as assignment_id,
    wa.week_start_date,
    wa.action_id,
    s.id as staff_id,
    s.user_id,
    sl.conf as confidence_score,
    sl.perf as performance_score,
    -- Set confidence submission to Monday 10:00 AM CT (well before Tue 12:00 deadline)
    (wa.week_start_date + INTERVAL '10 hours')::timestamptz as confidence_date,
    -- Set performance submission to Thursday 10:00 AM CT (well before Fri 17:00 deadline)
    (wa.week_start_date + INTERVAL '3 days 10 hours')::timestamptz as performance_date
  FROM weekly_assignments wa
  JOIN target_locations tl ON wa.location_id = tl.id
  JOIN staff s ON s.primary_location_id = wa.location_id 
    AND s.role_id = wa.role_id
    AND s.is_participant = true
  JOIN score_lookup sl ON sl.action_id = wa.action_id
  WHERE wa.week_start_date >= '2025-07-21'
    AND wa.week_start_date <= '2025-08-25'
    AND wa.status = 'locked'
    AND wa.source = 'onboarding'
    -- Staff must have started before or during that week
    AND wa.week_start_date >= COALESCE(s.participation_start_at::date, s.hire_date)
    -- No existing score for this assignment+staff combination
    AND NOT EXISTS (
      SELECT 1 FROM weekly_scores ws 
      WHERE ws.staff_id = s.id 
        AND ws.assignment_id = 'assign:' || wa.id
    )
)
INSERT INTO weekly_scores (
  staff_id,
  assignment_id,
  week_of,
  confidence_score,
  confidence_date,
  confidence_late,
  confidence_source,
  performance_score,
  performance_date,
  performance_late,
  performance_source,
  entered_by
)
SELECT 
  staff_id,
  'assign:' || assignment_id,
  week_start_date,
  confidence_score,
  confidence_date,
  false as confidence_late,
  'backfill_historical' as confidence_source,
  performance_score,
  performance_date,
  false as performance_late,
  'backfill_historical' as performance_source,
  user_id as entered_by
FROM missing_scores;