
-- Add organization_id to staff table for direct org membership
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- Backfill from location chain for non-roaming staff
UPDATE staff s
SET organization_id = pg.organization_id
FROM locations l
JOIN practice_groups pg ON pg.id = l.group_id
WHERE l.id = s.primary_location_id
  AND s.organization_id IS NULL;

-- Sanity check
DO $$
DECLARE
  total_staff INT;
  backfilled INT;
BEGIN
  SELECT count(*) INTO total_staff FROM staff;
  SELECT count(*) INTO backfilled FROM staff WHERE organization_id IS NOT NULL;
  RAISE NOTICE 'Staff total: %, backfilled: %', total_staff, backfilled;
END $$;
