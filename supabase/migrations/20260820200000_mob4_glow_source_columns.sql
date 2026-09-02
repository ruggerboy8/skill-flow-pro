-- MOB-4: per-item glow source attribution. Additive + idempotent.
-- Records WHO gave the glow, independent of evaluations.evaluator_id, so a glow
-- is not inferred from the eval's evaluator and the field is forward-compatible
-- with a future source-agnostic recognitions table.
select set_config('app.change_reason', 'MOB-4: add glow_source_staff_id/glow_source_type to evaluation_items so a glow records who gave it, decoupled from evaluations.evaluator_id', true);

ALTER TABLE public.evaluation_items
  ADD COLUMN IF NOT EXISTS glow_source_staff_id uuid,
  ADD COLUMN IF NOT EXISTS glow_source_type text,
  ADD COLUMN IF NOT EXISTS glow_source_name text;

-- Intentionally NO foreign key and NO CHECK constraint on glow_source_type:
-- keep it loose so future source types (office_manager, regional_manager, lead,
-- peer, system) need no migration. 'evaluator' is the only value written today.
COMMENT ON COLUMN public.evaluation_items.glow_source_staff_id IS
  'Staff who GAVE this competency''s glow (observer_glow). Set explicitly at capture from the acting user, not inferred from evaluations.evaluator_id. Nullable; forward-compatible with a future recognitions table.';
COMMENT ON COLUMN public.evaluation_items.glow_source_type IS
  'Loose source label for the glow: evaluator (today), later office_manager / regional_manager / lead / peer / system. No CHECK by design; extend without a migration.';
COMMENT ON COLUMN public.evaluation_items.glow_source_name IS
  'Denormalized display name of the glow giver, captured at the same time as glow_source_staff_id. A plain participant''s RLS only allows reading their OWN staff row, so the giver''s name cannot be resolved with a live join at read time for the feature''s normal (participant) audience; this snapshot lets the recognition card show it. Nullable; pre-MOB-4 glows have no snapshot and render without a name.';

-- Sanity check: columns exist and are nullable (no backfill needed — existing
-- rows keep null source columns without error).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'evaluation_items'
      AND column_name = 'glow_source_staff_id' AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'MOB-4 migration failed: glow_source_staff_id missing or not nullable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'evaluation_items'
      AND column_name = 'glow_source_type' AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'MOB-4 migration failed: glow_source_type missing or not nullable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'evaluation_items'
      AND column_name = 'glow_source_name' AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'MOB-4 migration failed: glow_source_name missing or not nullable';
  END IF;
END $$;
