ALTER TABLE public.doctor_baseline_assessments
  ADD COLUMN reflection_original text,
  ADD COLUMN reflection_formatted text,
  ADD COLUMN reflection_mode text,
  ADD COLUMN reflection_submitted_at timestamptz;