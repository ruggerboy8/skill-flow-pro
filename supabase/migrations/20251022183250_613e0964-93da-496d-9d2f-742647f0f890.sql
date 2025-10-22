-- Add home_route column to staff table
ALTER TABLE public.staff 
ADD COLUMN home_route TEXT DEFAULT '/';

COMMENT ON COLUMN public.staff.home_route IS 'Default landing page for the user based on their role';
