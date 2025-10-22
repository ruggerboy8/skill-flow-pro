-- Phase 0: Add participant flag to staff table
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS is_participant boolean NOT NULL DEFAULT true;

-- Backfill: coaches & super admins are not participants
UPDATE public.staff
SET is_participant = false
WHERE is_coach = true OR is_super_admin = true;

-- Add comment for documentation
COMMENT ON COLUMN public.staff.is_participant IS 'Controls whether staff receives weekly Pro Move assignments and appears in participant dashboards';