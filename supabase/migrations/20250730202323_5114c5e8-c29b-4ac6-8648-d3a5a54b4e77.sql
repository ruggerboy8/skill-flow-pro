-- Update RLS policy for staff table to allow coaches to read all staff records
DROP POLICY IF EXISTS "Self read/write" ON public.staff;

-- Allow users to read/write their own records
CREATE POLICY "Users can manage own records" ON public.staff
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Allow coaches and super admins to read all staff records
CREATE POLICY "Coaches can read all staff" ON public.staff
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM staff 
    WHERE user_id = auth.uid() 
    AND (is_coach = true OR is_super_admin = true)
  )
);