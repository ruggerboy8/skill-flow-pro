-- Add draft_interview_audio_path column to evaluations table
-- This stores the path to draft interview recordings for auto-save/recovery
ALTER TABLE public.evaluations 
ADD COLUMN IF NOT EXISTS draft_interview_audio_path TEXT;