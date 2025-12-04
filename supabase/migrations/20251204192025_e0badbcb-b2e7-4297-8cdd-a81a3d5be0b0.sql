-- Add is_org_admin column to staff table
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS is_org_admin boolean NOT NULL DEFAULT false;

-- Create a helper function that checks for any admin role (super admin OR org admin)
-- This can be used in RLS policies to simplify permission checks
CREATE OR REPLACE FUNCTION public.is_admin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff
    WHERE staff.user_id = check_user_id
      AND (staff.is_super_admin = true OR staff.is_org_admin = true)
  )
$$;