
-- 1. Create SECURITY DEFINER function to check existing coach baseline
CREATE OR REPLACE FUNCTION public.coach_baseline_exists_for_doctor(_doctor_staff_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM coach_baseline_assessments
    WHERE doctor_staff_id = _doctor_staff_id
  );
$$;

-- 2. Drop the recursive INSERT policy
DROP POLICY IF EXISTS "Coach can insert first assessment" ON coach_baseline_assessments;

-- 3. Recreate with the safe function
CREATE POLICY "Coach can insert first assessment" ON coach_baseline_assessments
  FOR INSERT TO authenticated
  WITH CHECK (
    is_clinical_or_admin(auth.uid())
    AND NOT coach_baseline_exists_for_doctor(doctor_staff_id)
  );
