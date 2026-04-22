CREATE POLICY "org_admins_can_update_deputy_connection"
ON public.deputy_connections
FOR UPDATE
TO authenticated
USING (
  (organization_id = current_user_org_id())
  AND EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
      AND (staff.is_org_admin = true OR staff.is_super_admin = true)
  )
)
WITH CHECK (
  (organization_id = current_user_org_id())
  AND EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
      AND (staff.is_org_admin = true OR staff.is_super_admin = true)
  )
);