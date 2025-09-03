-- Add participation start tracking to staff table
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS participation_start_at TIMESTAMPTZ;

-- Seed existing skip_backfill users with current timestamp
UPDATE public.staff
SET participation_start_at = now()
WHERE skip_backfill IS TRUE AND participation_start_at IS NULL;