-- Backfill week_start_date for weekly_focus table
-- This calculates the Monday date based on cycle/week using location configuration

-- First, add an index to speed up the update if not exists
CREATE INDEX IF NOT EXISTS idx_weekly_focus_week_start_date 
  ON weekly_focus(week_start_date) 
  WHERE week_start_date IS NOT NULL;

-- Backfill week_start_date for weekly_focus rows
-- Uses the first location found for each role (assumes all locations share program_start_date)
WITH role_config AS (
  SELECT DISTINCT ON (s.role_id)
    s.role_id,
    l.program_start_date::date AS start_date,
    l.cycle_length_weeks
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE l.program_start_date IS NOT NULL
  ORDER BY s.role_id, l.created_at
)
UPDATE weekly_focus wf
SET week_start_date = (
  rc.start_date + 
  ((wf.cycle - 1) * rc.cycle_length_weeks + (wf.week_in_cycle - 1)) * INTERVAL '7 days'
)::date
FROM role_config rc
WHERE wf.role_id = rc.role_id
  AND wf.week_start_date IS NULL;

-- Log the update
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled week_start_date for % weekly_focus rows', updated_count;
END $$;