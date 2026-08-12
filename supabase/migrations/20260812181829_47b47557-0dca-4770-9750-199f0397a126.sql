DROP POLICY IF EXISTS "Doctor coach can read assigned mentees" ON public.staff;
CREATE POLICY "Doctor coach can read assigned mentees"
ON public.staff FOR SELECT TO authenticated
USING (public.is_assigned_doctor_coach(auth.uid(), id));