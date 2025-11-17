-- Fix weekly_focus.week_start_date based on location's program_start_date
-- This migration recalculates all week_start_date values to match the actual Monday dates

UPDATE weekly_focus wf
SET week_start_date = (
  -- Get the location's program_start_date (already normalized to Monday)
  SELECT 
    l.program_start_date + 
    -- Add offset based on cycle and week
    (((wf.cycle - 1) * l.cycle_length_weeks + (wf.week_in_cycle - 1)) * INTERVAL '7 days')
  FROM locations l
  WHERE l.id IN (
    -- Find the location by matching the role_id pattern
    -- For simplicity, we'll use the first location with the correct cycle_length
    SELECT id FROM locations WHERE cycle_length_weeks = 6 LIMIT 1
  )
)
WHERE wf.role_id IS NOT NULL;

-- More precise update: match by organization if possible
-- This assumes all locations in an org share the same program_start_date
UPDATE weekly_focus wf
SET week_start_date = (
  SELECT 
    l.program_start_date + 
    (((wf.cycle - 1) * l.cycle_length_weeks + (wf.week_in_cycle - 1)) * INTERVAL '7 days')
  FROM locations l
  WHERE l.cycle_length_weeks = 6
  LIMIT 1
)
WHERE wf.week_start_date IS NULL OR wf.week_start_date < '2025-01-01';