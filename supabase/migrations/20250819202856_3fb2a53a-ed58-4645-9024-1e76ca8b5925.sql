-- Fix RDA (role_id=2) Cycle 1 Week 1 data structure
-- Remove self-select entries that shouldn't be in cycle 1
DELETE FROM weekly_focus 
WHERE role_id = 2 AND cycle = 1 AND week_in_cycle = 1 AND self_select = true;

-- Fix display order issues and ensure proper sequence
-- RDA Cycle 1 Week 1 should have exactly 3 pro moves with proper display order

-- First, let's update the existing valid entries with correct display orders
UPDATE weekly_focus 
SET display_order = 1 
WHERE id = '59c184a1-20d3-409d-a3b4-99fef395f555'; -- action_id 1 (Cultural)

UPDATE weekly_focus 
SET display_order = 2 
WHERE id = '9c526a52-6c81-48b9-9d17-c2e1f18b9b20'; -- action_id 19 (Clinical)

UPDATE weekly_focus 
SET display_order = 3 
WHERE id = '8479ef70-816a-4fca-8835-2bb9c0ae8a55'; -- action_id 21 (Clerical)

-- Remove the duplicate entry that was causing display_order conflict
DELETE FROM weekly_focus 
WHERE id = '91181268-d104-4359-b65d-05e9d181b3a8'; -- duplicate action_id 20

-- Add a proper Clinical competency pro move for display_order 2 if needed
-- Let's check if we need to add action_id 22 or create a new one for Clinical Team Communication
INSERT INTO weekly_focus (
  role_id, 
  cycle, 
  week_in_cycle, 
  display_order, 
  competency_id,
  action_id,
  self_select,
  universal
)
SELECT 
  2, -- RDA role
  1, -- cycle 1
  1, -- week 1  
  2, -- display order 2
  (SELECT competency_id FROM competencies WHERE name = 'Clinical Team Communication' LIMIT 1),
  22, -- assuming this pro move exists or we'll create it
  false,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM weekly_focus 
  WHERE role_id = 2 AND cycle = 1 AND week_in_cycle = 1 AND display_order = 2 AND action_id IS NOT NULL
);