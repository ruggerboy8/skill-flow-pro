-- Drop all existing restrictive policies
DROP POLICY IF EXISTS "Clinical staff can read assessments" ON coach_baseline_assessments;
DROP POLICY IF EXISTS "Coach can insert own assessments" ON coach_baseline_assessments;
DROP POLICY IF EXISTS "Coach can update own assessments" ON coach_baseline_assessments;

-- Recreate as PERMISSIVE (default)
CREATE POLICY "Clinical staff can read assessments"
ON coach_baseline_assessments FOR SELECT TO authenticated
USING (is_clinical_or_admin(auth.uid()));

CREATE POLICY "Coach can insert own assessments"
ON coach_baseline_assessments FOR INSERT TO authenticated
WITH CHECK (
  coach_staff_id = get_staff_id_for_user(auth.uid())
  AND is_clinical_or_admin(auth.uid())
);

CREATE POLICY "Coach can update own assessments"
ON coach_baseline_assessments FOR UPDATE TO authenticated
USING (
  coach_staff_id = get_staff_id_for_user(auth.uid())
  AND is_clinical_or_admin(auth.uid())
);