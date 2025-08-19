-- Create current week focus items for testing self-select functionality
-- Current date is 2025-08-19 which is ISO week 34

-- Insert weekly focus items for current week (2025-W34) with self-select slots
INSERT INTO weekly_focus (
  id,
  iso_year,
  iso_week,
  cycle,
  week_in_cycle,
  role_id,
  display_order,
  action_id,
  competency_id,
  self_select,
  universal
) VALUES 
  -- Site move (mandatory)
  (gen_random_uuid(), 2025, 34, 1, 1, 1, 1, 1001, 1, false, false),
  -- Self-select slot 1
  (gen_random_uuid(), 2025, 34, 1, 1, 1, 2, NULL, 2, true, false),
  -- Self-select slot 2  
  (gen_random_uuid(), 2025, 34, 1, 1, 1, 3, NULL, 3, true, false);

-- Verify the data was inserted
SELECT iso_year, iso_week, cycle, week_in_cycle, role_id, display_order, self_select 
FROM weekly_focus 
WHERE iso_year = 2025 AND iso_week = 34;