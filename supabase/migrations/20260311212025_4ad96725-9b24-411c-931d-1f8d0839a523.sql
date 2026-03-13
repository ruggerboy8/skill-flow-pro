CREATE POLICY "org_delete_superadmin_only"
  ON public.organizations
  FOR DELETE
  TO public
  USING (EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
      AND staff.is_super_admin = true
  ));