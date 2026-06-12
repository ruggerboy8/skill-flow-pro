-- Allow org-custom pro moves (UUID ids from organization_pro_moves) to be
-- stored in weekly_assignments alongside platform moves (integer action_ids).
-- The two ID spaces are incompatible, so a dedicated FK column is required.
-- action_id was already nullable (self-select slots), so no ALTER needed there.

ALTER TABLE public.weekly_assignments
  ADD COLUMN IF NOT EXISTS org_move_id UUID
    REFERENCES public.organization_pro_moves(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_weekly_assignments_org_move_id
  ON public.weekly_assignments(org_move_id)
  WHERE org_move_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'weekly_assignments'
      AND column_name = 'org_move_id'
  ) THEN
    RAISE EXCEPTION 'org_move_id column was not added to weekly_assignments';
  END IF;
  RAISE NOTICE 'weekly_assignments.org_move_id added successfully';
END $$;
