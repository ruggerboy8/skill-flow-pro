-- Grant Clinical Director access to Kasey Stark.
-- She is already is_doctor=true, is_org_admin=true, is_coach=true (role_id=4).
-- This adds the Clinical Director capability so she can invite and manage her own
-- Michigan doctors, while still participating as a doctor herself.
UPDATE public.staff
SET is_clinical_director = true
WHERE id = '9b05bd32-4a4a-41b9-8f7b-ed86be9bc50c'
  AND name = 'Kasey Stark';