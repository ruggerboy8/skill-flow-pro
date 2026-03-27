-- ─────────────────────────────────────────────────────────────────────────────
-- AI-Enhanced Pro Move Assignment — schema additions
-- Phase 1: curriculum priority weights on pro_moves,
--           generated_by / ai_rationale on weekly_assignments
-- ─────────────────────────────────────────────────────────────────────────────

-- Curriculum priority dimensions (0.00–1.00 each)
ALTER TABLE public.pro_moves
  ADD COLUMN IF NOT EXISTS curriculum_priority             NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS curriculum_priority_revenue     NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS curriculum_priority_patient_exp NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS curriculum_priority_foundational NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS curriculum_priority_rationale   TEXT,
  ADD COLUMN IF NOT EXISTS curriculum_priority_generated_at TIMESTAMPTZ;

-- COMMENT: curriculum_priority = max(revenue, patient_exp, foundational)
-- NULL means not yet scored; treated as 0.50 (neutral) in sequencer-rank

-- Auto-assignment tracking on weekly_assignments
ALTER TABLE public.weekly_assignments
  ADD COLUMN IF NOT EXISTS generated_by TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ai_rationale TEXT;

-- Sanity check
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'pro_moves'
            AND column_name  = 'curriculum_priority') = 1,
    'curriculum_priority column missing from pro_moves';

  ASSERT (SELECT COUNT(*) FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name   = 'weekly_assignments'
            AND column_name  = 'generated_by') = 1,
    'generated_by column missing from weekly_assignments';

  RAISE NOTICE 'Migration 20260327120000 sanity checks passed.';
END;
$$;
