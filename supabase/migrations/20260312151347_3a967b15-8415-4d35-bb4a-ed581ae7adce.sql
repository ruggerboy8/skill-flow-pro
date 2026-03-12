
-- Create a security definer function to safely read current user's privilege flags
-- without triggering recursive RLS evaluation on the staff table
CREATE OR REPLACE FUNCTION public.get_own_staff_flags()
RETURNS TABLE(is_coach boolean, is_super_admin boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.is_coach, s.is_super_admin
  FROM public.staff s
  WHERE s.user_id = auth.uid()
  LIMIT 1;
$$;

-- Drop the recursive policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.staff;

-- Recreate it using the security definer function (no more self-referencing)
CREATE POLICY "Users can update own profile"
ON public.staff
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND is_coach = (SELECT f.is_coach FROM public.get_own_staff_flags() f)
  AND is_super_admin = (SELECT f.is_super_admin FROM public.get_own_staff_flags() f)
);
