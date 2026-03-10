-- The coach_baseline_assessments INSERT policy is RESTRICTIVE, but there's no 
-- PERMISSIVE policy, so INSERT always fails. Fix by replacing with a PERMISSIVE policy.

DROP POLICY IF EXISTS "Coach can insert own assessments" ON coach_baseline_assessments;

CREATE POLICY "Coach can insert own assessments"
ON coach_baseline_assessments
FOR INSERT
TO authenticated
WITH CHECK (
  coach_staff_id = get_staff_id_for_user(auth.uid())
  AND is_clinical_or_admin(auth.uid())
);