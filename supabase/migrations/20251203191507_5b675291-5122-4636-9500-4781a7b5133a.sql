-- Fix hire_date for staff with backfilled scores from before their current hire_date
-- This restores visibility of historical weeks on staff detail pages
-- Excludes Kelly Acuna (19fb10b7-1a4c-43a9-9093-6efa5c35838e) per request

UPDATE staff s
SET hire_date = earliest_scores.earliest_week
FROM (
  SELECT 
    ws.staff_id,
    MIN(ws.week_of) AS earliest_week,
    MIN(st.hire_date) AS current_hire_date
  FROM weekly_scores ws
  INNER JOIN staff st ON st.id = ws.staff_id
  WHERE st.id != '19fb10b7-1a4c-43a9-9093-6efa5c35838e'  -- Exclude Kelly Acuna
  GROUP BY ws.staff_id
) earliest_scores
WHERE s.id = earliest_scores.staff_id
  AND earliest_scores.earliest_week < earliest_scores.current_hire_date;