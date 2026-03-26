
-- Backfill roaming doctors (Alcan org)
UPDATE staff
SET organization_id = 'a1ca0000-0000-0000-0000-000000000001'
WHERE is_doctor = true
  AND primary_location_id IS NULL
  AND organization_id IS NULL;
