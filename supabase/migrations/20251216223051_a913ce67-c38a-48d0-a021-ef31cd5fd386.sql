-- Add summary columns to evaluations table for AI-assisted feedback
ALTER TABLE public.evaluations
ADD COLUMN summary_feedback TEXT,
ADD COLUMN summary_raw_transcript TEXT;