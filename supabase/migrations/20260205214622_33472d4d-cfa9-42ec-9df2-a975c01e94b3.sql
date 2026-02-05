-- Remove duplicate pro_move_resources (keep first one by id)
DELETE FROM pro_move_resources 
WHERE id IN (
  SELECT id FROM (
    SELECT id, 
           ROW_NUMBER() OVER (PARTITION BY action_id, type ORDER BY id) as rn
    FROM pro_move_resources
    WHERE action_id >= 189
  ) sub
  WHERE rn > 1
);