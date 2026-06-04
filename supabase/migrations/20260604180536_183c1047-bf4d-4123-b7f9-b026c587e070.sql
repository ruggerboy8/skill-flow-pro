
-- Allow clinical directors / super admins to update the assessment record
DROP POLICY IF EXISTS "Clinical staff can update assessment" ON public.coach_baseline_assessments;
CREATE POLICY "Clinical staff can update assessment"
ON public.coach_baseline_assessments
FOR UPDATE TO authenticated
USING (public.is_clinical_or_admin(auth.uid()))
WITH CHECK (public.is_clinical_or_admin(auth.uid()));

-- Allow clinical directors / super admins to insert items on any assessment
DROP POLICY IF EXISTS "Clinical staff can insert items" ON public.coach_baseline_items;
CREATE POLICY "Clinical staff can insert items"
ON public.coach_baseline_items
FOR INSERT TO authenticated
WITH CHECK (
  public.is_clinical_or_admin(auth.uid())
  AND assessment_id IN (SELECT id FROM public.coach_baseline_assessments)
);

-- Allow clinical directors / super admins to update items on any assessment
DROP POLICY IF EXISTS "Clinical staff can update items" ON public.coach_baseline_items;
CREATE POLICY "Clinical staff can update items"
ON public.coach_baseline_items
FOR UPDATE TO authenticated
USING (public.is_clinical_or_admin(auth.uid()))
WITH CHECK (public.is_clinical_or_admin(auth.uid()));
