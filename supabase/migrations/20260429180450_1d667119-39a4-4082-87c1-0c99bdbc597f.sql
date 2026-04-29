-- One-time data update: enable Doctor portal access for Kasey Stark.
-- She is a Regional Manager (org_admin + coach) at Lake Orion who also practices as a doctor.
-- After UI changes, isDoctor is additive — she keeps all admin powers and gets the Doctor portal.
UPDATE public.staff
SET is_doctor = true,
    role_id = 4
WHERE id = '9b05bd32-4a4a-41b9-8f7b-ed86be9bc50c'
  AND name = 'Kasey Stark';

-- Sanity check
DO $$
DECLARE
  rec record;
BEGIN
  SELECT id, name, is_doctor, role_id, is_org_admin, is_coach, home_route
    INTO rec
    FROM public.staff
   WHERE id = '9b05bd32-4a4a-41b9-8f7b-ed86be9bc50c';
  IF rec.is_doctor IS NOT TRUE THEN
    RAISE EXCEPTION 'Kasey is_doctor flag not set';
  END IF;
  IF rec.role_id <> 4 THEN
    RAISE EXCEPTION 'Kasey role_id not set to Doctor (4)';
  END IF;
  IF rec.is_org_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Kasey lost org admin powers — aborting';
  END IF;
  RAISE NOTICE 'Kasey updated: is_doctor=%, role_id=%, is_org_admin=%, is_coach=%, home_route=%',
    rec.is_doctor, rec.role_id, rec.is_org_admin, rec.is_coach, rec.home_route;
END $$;