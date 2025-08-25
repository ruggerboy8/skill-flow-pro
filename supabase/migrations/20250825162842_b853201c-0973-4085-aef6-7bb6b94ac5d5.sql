-- Add user back as coach and superadmin
-- Using the first user from auth.users: ryanjoberly@gmail.com
INSERT INTO public.staff (
  user_id,
  name,
  email,
  role_id,
  primary_location_id,
  is_coach,
  is_super_admin,
  onboarding_weeks
) VALUES (
  'fb515ca7-7798-4484-9fb9-9edf08f16240',
  'Ryan Joberly',
  'ryanjoberly@gmail.com',
  1, -- Assuming role_id 1 exists
  (SELECT id FROM public.locations LIMIT 1), -- Use first available location
  true,
  true,
  0 -- No onboarding needed for admin
);