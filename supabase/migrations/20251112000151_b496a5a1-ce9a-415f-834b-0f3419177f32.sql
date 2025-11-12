-- Add status column and update constraints for audio lifecycle management

-- Add status column if it doesn't exist
ALTER TABLE pro_move_resources 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived'));

-- Ensure metadata column exists
ALTER TABLE pro_move_resources 
ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

-- Create unique constraint: only one active audio per action
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_audio_per_action 
ON pro_move_resources(action_id) 
WHERE type = 'audio' AND status = 'active';

-- Update existing audio resources to be active
UPDATE pro_move_resources 
SET status = 'active' 
WHERE type = 'audio' AND status IS NULL;