ALTER TABLE public.coaching_agenda_templates
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_org_default boolean NOT NULL DEFAULT false;

-- Backfill org from the owning staff record
UPDATE public.coaching_agenda_templates t
SET organization_id = s.organization_id
FROM public.staff s
WHERE s.id = t.staff_id AND t.organization_id IS NULL;

-- One default per org + session type
CREATE UNIQUE INDEX IF NOT EXISTS coaching_agenda_templates_org_default_uniq
  ON public.coaching_agenda_templates (organization_id, session_type)
  WHERE is_org_default;

-- Coaches in the same org can read the org default template
DROP POLICY IF EXISTS "Org coaches can read org default templates" ON public.coaching_agenda_templates;
CREATE POLICY "Org coaches can read org default templates"
  ON public.coaching_agenda_templates FOR SELECT
  TO authenticated
  USING (
    is_org_default = true
    AND (
      organization_id = public.current_user_org_id()
      OR public.is_superadmin()
    )
  );

-- Only super admins may flag a template as the org default
DROP POLICY IF EXISTS "Super admins manage org default templates" ON public.coaching_agenda_templates;
CREATE POLICY "Super admins manage org default templates"
  ON public.coaching_agenda_templates FOR ALL
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_agenda_templates TO authenticated;
GRANT ALL ON public.coaching_agenda_templates TO service_role;