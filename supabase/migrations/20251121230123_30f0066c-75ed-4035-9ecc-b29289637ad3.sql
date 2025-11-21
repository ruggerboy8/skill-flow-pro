-- One-time data fix: Correct week_of to match actual submission date
-- This fixes the bug where week_of was set to assignment's week_start_date 
-- instead of the actual week when scores were submitted

UPDATE weekly_scores
SET week_of = CASE
  WHEN confidence_date IS NOT NULL THEN 
    DATE_TRUNC('week', confidence_date)::date + 
    CASE EXTRACT(DOW FROM confidence_date)::int
      WHEN 0 THEN -6  -- Sunday
      WHEN 1 THEN 0   -- Monday (already start of week)
      WHEN 2 THEN -1  -- Tuesday
      WHEN 3 THEN -2  -- Wednesday
      WHEN 4 THEN -3  -- Thursday
      WHEN 5 THEN -4  -- Friday
      WHEN 6 THEN -5  -- Saturday
    END
  WHEN performance_date IS NOT NULL THEN 
    DATE_TRUNC('week', performance_date)::date + 
    CASE EXTRACT(DOW FROM performance_date)::int
      WHEN 0 THEN -6  -- Sunday
      WHEN 1 THEN 0   -- Monday (already start of week)
      WHEN 2 THEN -1  -- Tuesday
      WHEN 3 THEN -2  -- Wednesday
      WHEN 4 THEN -3  -- Thursday
      WHEN 5 THEN -4  -- Friday
      WHEN 6 THEN -5  -- Saturday
    END
  ELSE week_of  -- Keep current if no dates
END
WHERE assignment_id IS NOT NULL
  AND assignment_id LIKE 'assign:%'
  AND (
    (confidence_date IS NOT NULL AND week_of != (
      DATE_TRUNC('week', confidence_date)::date + 
      CASE EXTRACT(DOW FROM confidence_date)::int
        WHEN 0 THEN -6 WHEN 1 THEN 0 WHEN 2 THEN -1 
        WHEN 3 THEN -2 WHEN 4 THEN -3 WHEN 5 THEN -4 WHEN 6 THEN -5
      END
    ))
    OR
    (performance_date IS NOT NULL AND week_of != (
      DATE_TRUNC('week', performance_date)::date + 
      CASE EXTRACT(DOW FROM performance_date)::int
        WHEN 0 THEN -6 WHEN 1 THEN 0 WHEN 2 THEN -1 
        WHEN 3 THEN -2 WHEN 4 THEN -3 WHEN 5 THEN -4 WHEN 6 THEN -5
      END
    ))
  );