-- Allow doctors to read their own coach baseline assessment and items
CREATE POLICY "Doctor can view own coach baseline assessment"
ON public.coach_baseline_assessments
FOR SELECT
TO authenticated
USING (
  doctor_staff_id IN (
    SELECT s.id FROM staff s WHERE s.user_id = auth.uid() AND s.is_doctor = true
  )
);

CREATE POLICY "Doctor can view own coach baseline items"
ON public.coach_baseline_items
FOR SELECT
TO authenticated
USING (
  assessment_id IN (
    SELECT cba.id FROM coach_baseline_assessments cba
    WHERE cba.doctor_staff_id IN (
      SELECT s.id FROM staff s WHERE s.user_id = auth.uid() AND s.is_doctor = true
    )
  )
);