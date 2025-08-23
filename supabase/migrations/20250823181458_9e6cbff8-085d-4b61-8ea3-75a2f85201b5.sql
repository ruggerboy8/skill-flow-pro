-- Fix RDA pro-moves that were incorrectly assigned to DFI competencies during 8/22 bulk upload
-- Move them to the correct RDA competencies

-- Trust Building Interactions: DFI (11) → RDA (27)
UPDATE pro_moves 
SET competency_id = 27 
WHERE action_id = 57 AND role_id = 2;

-- Empathetic Practice Policy Education: DFI (10) → RDA (25)  
UPDATE pro_moves 
SET competency_id = 25 
WHERE action_id = 67 AND role_id = 2;

-- Effective Objection Handling: DFI (13) → RDA (29)
UPDATE pro_moves 
SET competency_id = 29 
WHERE action_id IN (68, 72) AND role_id = 2;