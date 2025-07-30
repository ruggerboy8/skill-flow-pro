-- Drop the problematic policy that's causing recursion
DROP POLICY IF EXISTS "Coaches can read all staff" ON public.staff;

-- Create a security definer function to check if user is coach/admin
CREATE OR REPLACE FUNCTION public.is_coach_or_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff
    WHERE user_id = _user_id
      AND (is_coach = true OR is_super_admin = true)
  )
$$;

-- Create new policy using the security definer function
CREATE POLICY "Coaches can read all staff" ON public.staff
FOR SELECT TO authenticated
USING (
  user_id = auth.uid() OR public.is_coach_or_admin(auth.uid())
);