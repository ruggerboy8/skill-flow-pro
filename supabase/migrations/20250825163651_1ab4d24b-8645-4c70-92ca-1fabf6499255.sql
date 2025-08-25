-- Update Johno Oberly to be coach and superadmin
UPDATE public.staff 
SET 
  is_coach = true,
  is_super_admin = true,
  updated_at = now()
WHERE user_id = 'f4bf43b4-6038-4e7a-856e-d6fe7e1d8022';