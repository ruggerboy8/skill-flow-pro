-- Phase 1: Office Manager Database Foundation

-- 1. Add Office Manager role to roles table
INSERT INTO public.roles (role_id, role_name) 
VALUES (3, 'Office Manager')
ON CONFLICT (role_id) DO NOTHING;

-- 2. Add is_office_manager column to staff table
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS is_office_manager boolean NOT NULL DEFAULT false;

-- 3. Create helper function to check if user is an office manager for a specific location
CREATE OR REPLACE FUNCTION public.is_office_manager_for_location(loc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.staff s
    JOIN public.coach_scopes cs ON cs.staff_id = s.id
    WHERE s.user_id = auth.uid()
      AND s.is_office_manager = true
      AND cs.scope_type = 'location'
      AND cs.scope_id = loc_id
  )
$$;

-- 4. Create helper function to get the office manager's managed location ID
CREATE OR REPLACE FUNCTION public.get_office_manager_location_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cs.scope_id
  FROM public.staff s
  JOIN public.coach_scopes cs ON cs.staff_id = s.id
  WHERE s.user_id = auth.uid()
    AND s.is_office_manager = true
    AND cs.scope_type = 'location'
  LIMIT 1
$$;