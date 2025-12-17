-- Add interview transcript column to evaluations table for self-assessment audio transcription
ALTER TABLE public.evaluations
ADD COLUMN interview_transcript TEXT;