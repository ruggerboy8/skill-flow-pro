CREATE POLICY "Staff can view own excused submissions"
ON public.excused_submissions
FOR SELECT
TO authenticated
USING (
  staff_id IN (
    SELECT id FROM public.staff WHERE user_id = auth.uid()
  )
);