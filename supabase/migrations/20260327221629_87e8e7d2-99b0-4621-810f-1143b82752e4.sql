ALTER TABLE public.pro_moves
  ADD COLUMN IF NOT EXISTS curriculum_priority numeric,
  ADD COLUMN IF NOT EXISTS curriculum_priority_revenue numeric,
  ADD COLUMN IF NOT EXISTS curriculum_priority_patient_exp numeric,
  ADD COLUMN IF NOT EXISTS curriculum_priority_foundational numeric,
  ADD COLUMN IF NOT EXISTS curriculum_priority_rationale text,
  ADD COLUMN IF NOT EXISTS curriculum_priority_generated_at timestamptz;