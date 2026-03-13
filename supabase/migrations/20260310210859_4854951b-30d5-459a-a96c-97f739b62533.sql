-- Drop the recursive policy
DROP POLICY IF EXISTS "Doctor can read own coach" ON public.staff;

-- Create a security definer function to get coach staff IDs for a user
CREATE OR REPLACE FUNCTION public.get_my_coach_staff_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT cs.coach_staff_id
  FROM coaching_sessions cs
  JOIN staff s ON s.id = cs.doctor_staff_id
  WHERE s.user_id = _user_id
$$;

-- Re-create the policy using the function
CREATE POLICY "Doctor can read own coach"
ON public.staff
FOR SELECT
TO authenticated
USING (
  id IN (SELECT public.get_my_coach_staff_ids(auth.uid()))
);