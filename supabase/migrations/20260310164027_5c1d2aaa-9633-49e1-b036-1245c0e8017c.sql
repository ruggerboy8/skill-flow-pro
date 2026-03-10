-- Allow super_admins to insert/update regardless of coach_staff_id match (supports masquerade)
DROP POLICY IF EXISTS "Coach can insert own assessments" ON coach_baseline_assessments;
CREATE POLICY "Coach can insert own assessments"
ON coach_baseline_assessments FOR INSERT TO authenticated
WITH CHECK (
  is_clinical_or_admin(auth.uid())
);

DROP POLICY IF EXISTS "Coach can update own assessments" ON coach_baseline_assessments;
CREATE POLICY "Coach can update own assessments"
ON coach_baseline_assessments FOR UPDATE TO authenticated
USING (
  is_clinical_or_admin(auth.uid())
);