-- First check what exists for current week (ISO week 34, 2025) 
SELECT iso_year, iso_week, cycle, week_in_cycle, role_id, display_order, self_select, action_id, competency_id
FROM weekly_focus 
WHERE iso_year = 2025 AND iso_week = 34;

-- Try to insert with different approach - using role_id 2 (the user's role) instead of 1
DELETE FROM weekly_focus WHERE iso_year = 2025 AND iso_week = 34 AND role_id = 2;

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
  -- Site move (mandatory) - with NULL action_id for self-select
  (gen_random_uuid(), 2025, 34, 1, 1, 2, 1, 1001, 1, false, false),
  -- Self-select slot 1 
  (gen_random_uuid(), 2025, 34, 1, 1, 2, 2, NULL, 2, true, false),
  -- Self-select slot 2  
  (gen_random_uuid(), 2025, 34, 1, 1, 2, 3, NULL, 3, true, false);

-- Verify
SELECT iso_year, iso_week, cycle, week_in_cycle, role_id, display_order, self_select, action_id, competency_id
FROM weekly_focus 
WHERE iso_year = 2025 AND iso_week = 34 AND role_id = 2;