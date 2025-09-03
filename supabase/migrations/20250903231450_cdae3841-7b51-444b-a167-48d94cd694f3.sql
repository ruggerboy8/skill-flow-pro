-- Add participation start tracking to staff table
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS participation_start_at TIMESTAMPTZ;