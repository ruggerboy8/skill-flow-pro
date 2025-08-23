-- Fix data inconsistency: Move RDA pro-move from DFI competency to correct RDA competency
-- Action 70 should be assigned to RDA Establishing Credibility (competency 31) not DFI Establishing Credibility (competency 15)

UPDATE pro_moves 
SET competency_id = 31 
WHERE action_id = 70 AND role_id = 2;