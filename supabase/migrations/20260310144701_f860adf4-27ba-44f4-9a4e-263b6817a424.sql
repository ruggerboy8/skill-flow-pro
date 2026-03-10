-- Part 1: Add scheduling_link to staff
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS scheduling_link text;

-- Part 1: Make coaching_sessions.scheduled_at nullable
ALTER TABLE public.coaching_sessions ALTER COLUMN scheduled_at DROP NOT NULL;

-- Part 2: Add recording_transcript and domain_notes to coach_baseline_assessments
ALTER TABLE public.coach_baseline_assessments ADD COLUMN IF NOT EXISTS recording_transcript text;
ALTER TABLE public.coach_baseline_assessments ADD COLUMN IF NOT EXISTS domain_notes jsonb DEFAULT '{}'::jsonb;