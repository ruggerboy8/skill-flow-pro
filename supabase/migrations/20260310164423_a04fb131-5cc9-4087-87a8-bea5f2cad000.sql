-- Relax coach_baseline_items INSERT/UPDATE to allow any clinical/admin user
DROP POLICY IF EXISTS "Coach can insert own items" ON coach_baseline_items;
CREATE POLICY "Coach can insert own items"
ON coach_baseline_items FOR INSERT TO authenticated
WITH CHECK (is_clinical_or_admin(auth.uid()));

DROP POLICY IF EXISTS "Coach can update own items" ON coach_baseline_items;
CREATE POLICY "Coach can update own items"
ON coach_baseline_items FOR UPDATE TO authenticated
USING (is_clinical_or_admin(auth.uid()));