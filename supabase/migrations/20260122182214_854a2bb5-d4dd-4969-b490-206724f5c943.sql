-- Add policy for super admins to write scores on behalf of any staff member
-- This enables masquerade/backfill functionality
CREATE POLICY "Super admins can write any scores"
  ON public.weekly_scores
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.is_super_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.user_id = auth.uid()
      AND staff.is_super_admin = true
    )
  );