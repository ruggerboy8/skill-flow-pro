
-- Allow clinical directors and super admins to view all coaching sessions (read-only)
CREATE POLICY "Clinical staff can view all sessions"
ON public.coaching_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND (staff.is_clinical_director = true OR staff.is_super_admin = true)
  )
);

-- Also need super admins to UPDATE sessions (for reassign)
CREATE POLICY "Super admins can update any session"
ON public.coaching_sessions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND staff.is_super_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND staff.is_super_admin = true
  )
);

-- Clinical directors/super admins also need to read selections and meeting records for non-owned sessions
CREATE POLICY "Clinical staff can view all selections"
ON public.coaching_session_selections
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND (staff.is_clinical_director = true OR staff.is_super_admin = true)
  )
);

CREATE POLICY "Clinical staff can view all meeting records"
ON public.coaching_meeting_records
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND (staff.is_clinical_director = true OR staff.is_super_admin = true)
  )
);
