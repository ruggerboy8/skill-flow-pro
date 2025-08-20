-- Fix action_id auto-increment for pro_moves table
-- Create sequence if it doesn't exist
CREATE SEQUENCE IF NOT EXISTS pro_moves_action_id_seq;

-- Set the sequence as default for action_id column
ALTER TABLE pro_moves ALTER COLUMN action_id SET DEFAULT nextval('pro_moves_action_id_seq');

-- Set the sequence ownership to the column
ALTER SEQUENCE pro_moves_action_id_seq OWNED BY pro_moves.action_id;

-- Set the sequence to start from the current max value + 1
SELECT setval('pro_moves_action_id_seq', COALESCE((SELECT MAX(action_id) FROM pro_moves), 0) + 1, false);