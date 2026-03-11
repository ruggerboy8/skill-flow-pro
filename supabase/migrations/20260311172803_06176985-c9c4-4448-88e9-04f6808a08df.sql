DROP POLICY IF EXISTS "Coach can insert own assessments" ON public.coach_baseline_assessments;
DROP POLICY IF EXISTS "Coach can update own assessments" ON public.coach_baseline_assessments;

CREATE POLICY "Coach can insert first assessment"
ON public.coach_baseline_assessments
FOR INSERT
TO authenticated
WITH CHECK (
  is_clinical_or_admin(auth.uid())
  AND NOT EXISTS (
    SELECT 1 FROM public.coach_baseline_assessments existing
    WHERE existing.doctor_staff_id = coach_baseline_assessments.doctor_staff_id
  )
);

CREATE POLICY "Owning coach can update assessment"
ON public.coach_baseline_assessments
FOR UPDATE
TO authenticated
USING (
  coach_staff_id IN (
    SELECT s.id FROM staff s WHERE s.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Coach can insert own items" ON public.coach_baseline_items;
DROP POLICY IF EXISTS "Coach can update own items" ON public.coach_baseline_items;

CREATE POLICY "Owning coach can insert items"
ON public.coach_baseline_items
FOR INSERT
TO authenticated
WITH CHECK (
  assessment_id IN (
    SELECT cba.id FROM coach_baseline_assessments cba
    JOIN staff s ON s.id = cba.coach_staff_id
    WHERE s.user_id = auth.uid()
  )
);

CREATE POLICY "Owning coach can update items"
ON public.coach_baseline_items
FOR UPDATE
TO authenticated
USING (
  assessment_id IN (
    SELECT cba.id FROM coach_baseline_assessments cba
    JOIN staff s ON s.id = cba.coach_staff_id
    WHERE s.user_id = auth.uid()
  )
);