-- Drop the existing admin-only policy
DROP POLICY IF EXISTS "pmr_admin_all" ON public.pro_move_resources;

-- Create new policy that allows coaches and admins to manage pro_move_resources
CREATE POLICY "pmr_admin_all"
ON public.pro_move_resources
FOR ALL
TO authenticated
USING (public.is_coach_or_admin(auth.uid()))
WITH CHECK (public.is_coach_or_admin(auth.uid()));