-- Update existing user to be coach and superadmin
UPDATE public.staff 
SET 
  is_coach = true,
  is_super_admin = true,
  updated_at = now()
WHERE user_id = '0df48cba-1e22-4588-8685-72da2566f2e5';