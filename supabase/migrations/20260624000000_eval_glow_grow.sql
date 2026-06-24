-- Evaluation overhaul (Phase 1, Workstream A): additive Glow/Grow storage.
--
-- Adds per-competency Glow and Grow coaching text to evaluation_items, produced
-- by the new per-domain capture flow (slot-domain-feedback). This is ADDITIVE
-- and non-breaking: the existing observer_note column is left in place and
-- still populated for backward compatibility (the staff review payload and
-- EvaluationViewer continue to read it) until Phase 2 migrates those consumers
-- to read Glow/Grow directly.
--
-- Apply via the Supabase dashboard SQL Editor (db push is not used in this
-- project; see CLAUDE.md). Idempotent.

ALTER TABLE public.evaluation_items
  ADD COLUMN IF NOT EXISTS observer_glow text,
  ADD COLUMN IF NOT EXISTS observer_grow text;

COMMENT ON COLUMN public.evaluation_items.observer_glow IS
  'Per-competency reinforcing (Glow) coaching note, you-voice, from the per-domain capture flow. Additive; observer_note remains the legacy combined note.';
COMMENT ON COLUMN public.evaluation_items.observer_grow IS
  'Per-competency growth (Grow) coaching note, you-voice, from the per-domain capture flow. Additive; observer_note remains the legacy combined note.';
