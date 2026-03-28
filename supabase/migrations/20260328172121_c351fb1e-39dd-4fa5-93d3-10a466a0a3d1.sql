ALTER TABLE public.weekly_assignments
  ADD COLUMN IF NOT EXISTS ai_rationale text,
  ADD COLUMN IF NOT EXISTS rank_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS generated_by text;