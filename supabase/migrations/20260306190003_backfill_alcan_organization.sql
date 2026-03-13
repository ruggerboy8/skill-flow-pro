-- Migration: Backfill Alcan as the first organization (tenant)
-- All existing practice_groups (Main Organization, Sprout, Kids Tooth Team)
-- are subsidiaries of the Alcan DSO and belong to the same organization.
--
-- This migration:
--   1. Creates the Alcan organization record with a stable, known UUID
--   2. Links all existing practice_groups to Alcan
--   3. Makes organization_id NOT NULL (safe: all rows are backfilled above)
--   4. Adds practice_type column to roles (for pro move library scoping)

-- 1. Create Alcan organization
--    Using a stable UUID so it can be referenced in future migrations/scripts.
INSERT INTO public.organizations (id, name, slug, practice_type)
VALUES (
  'a1ca0000-0000-0000-0000-000000000001',
  'Alcan Pediatric Dental',
  'alcan',
  'pediatric'
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Link all existing practice_groups to Alcan
UPDATE public.practice_groups
SET organization_id = 'a1ca0000-0000-0000-0000-000000000001'
WHERE organization_id IS NULL;

-- 3. Make organization_id NOT NULL now that all rows have been backfilled
ALTER TABLE public.practice_groups
  ALTER COLUMN organization_id SET NOT NULL;

-- 4. Add practice_type to pro_moves for pro move library scoping
--    Existing pro moves are pediatric-specific; new rows default to 'pediatric'.
--    'all' means the pro move applies to any practice type.
ALTER TABLE public.pro_moves
  ADD COLUMN IF NOT EXISTS practice_type TEXT NOT NULL DEFAULT 'pediatric'
  CHECK (practice_type IN ('pediatric', 'general', 'all'));

-- 5. Verify backfill succeeded (will raise exception if any groups are unlinked)
DO $$
DECLARE
  unlinked_count INT;
BEGIN
  SELECT COUNT(*) INTO unlinked_count
  FROM public.practice_groups
  WHERE organization_id IS NULL;

  IF unlinked_count > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % practice_groups still have NULL organization_id', unlinked_count;
  END IF;
END;
$$;
