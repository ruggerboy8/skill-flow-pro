-- Add a policy to allow service role to bypass RLS restrictions for staff privilege updates
-- This ensures manual changes from Supabase dashboard work properly

CREATE POLICY "Service role can manage all staff privileges"
ON public.staff
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Also add a policy for authenticated users with proper permissions to manage staff privileges
-- This is more explicit than the existing policy
CREATE POLICY "Super admins can manage any staff privileges"
ON public.staff
FOR UPDATE
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));