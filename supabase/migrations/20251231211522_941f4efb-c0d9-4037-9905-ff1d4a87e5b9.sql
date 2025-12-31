-- Add column to store draft observation audio path for autosave
ALTER TABLE evaluations 
ADD COLUMN IF NOT EXISTS draft_observation_audio_path text;