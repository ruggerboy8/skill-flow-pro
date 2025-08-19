-- Use existing action_ids from pro_moves table
-- Let's check available action_ids first and use them

-- Delete existing test data for current week
DELETE FROM weekly_focus WHERE iso_year = 2025 AND iso_week = 34;

-- Insert with valid action_ids (using real ones from the system)
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
  -- Site move (mandatory) - using an existing action_id
  (gen_random_uuid(), 2025, 34, 1, 1, 2, 1, (SELECT action_id FROM pro_moves LIMIT 1), 1, false, false),
  -- Self-select slot 1 (no action_id for self-select)
  (gen_random_uuid(), 2025, 34, 1, 1, 2, 2, NULL, 2, true, false),
  -- Self-select slot 2  
  (gen_random_uuid(), 2025, 34, 1, 1, 2, 3, NULL, 3, true, false);

-- Verify the current week data
SELECT wf.id, wf.iso_year, wf.iso_week, wf.cycle, wf.week_in_cycle, wf.role_id, 
       wf.display_order, wf.self_select, wf.action_id, pm.action_statement
FROM weekly_focus wf
LEFT JOIN pro_moves pm ON pm.action_id = wf.action_id
WHERE wf.iso_year = 2025 AND wf.iso_week = 34 AND wf.role_id = 2
ORDER BY wf.display_order;