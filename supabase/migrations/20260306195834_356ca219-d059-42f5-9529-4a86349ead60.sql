CREATE POLICY "org_select_own_or_superadmin"
  ON public.organizations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true)
    OR id IN (
      SELECT pg.organization_id FROM public.practice_groups pg
      JOIN public.locations l ON l.group_id = pg.id
      JOIN public.staff s ON s.primary_location_id = l.id
      WHERE s.user_id = auth.uid()
    )
  );

CREATE POLICY "role_names_select_own_org"
  ON public.organization_role_names FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true)
    OR org_id IN (
      SELECT pg.organization_id FROM public.practice_groups pg
      JOIN public.locations l ON l.group_id = pg.id
      JOIN public.staff s ON s.primary_location_id = l.id
      WHERE s.user_id = auth.uid()
    )
  );