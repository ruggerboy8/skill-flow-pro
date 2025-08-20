-- Add interview_prompt column to competencies table
ALTER TABLE public.competencies 
ADD COLUMN interview_prompt text;