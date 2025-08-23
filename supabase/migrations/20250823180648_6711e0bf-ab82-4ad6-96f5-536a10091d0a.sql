-- Replace references to duplicate pro-move (action_id 36) with the newer version (action_id 33)
-- This updates weekly focus schedules that were using the old duplicate

UPDATE weekly_focus 
SET action_id = 33 
WHERE action_id = 36;

-- Now we can safely delete the duplicate pro-move
DELETE FROM pro_moves 
WHERE action_id = 36;