-- Deputy employee → SFP staff mappings
-- Populated automatically during sync when new Deputy employees are seen.
-- Admin confirms or reassigns each mapping before excusals are created.
-- Only confirmed rows (is_confirmed = true) trigger auto-excusals.

CREATE TABLE public.deputy_employee_mappings (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deputy_employee_id   integer NOT NULL,
  deputy_display_name  text    NOT NULL,      -- "Alex Otto" (from Deputy API)
  staff_id             uuid    REFERENCES public.staff(id) ON DELETE SET NULL,
  is_confirmed         boolean NOT NULL DEFAULT false,  -- admin verified the name match
  is_ignored           boolean NOT NULL DEFAULT false,  -- skip (non-SFP staff like front desk)
  created_at           timestamptz DEFAULT NOW(),
  updated_at           timestamptz DEFAULT NOW(),
  UNIQUE (organization_id, deputy_employee_id)
);

ALTER TABLE public.deputy_employee_mappings ENABLE ROW LEVEL SECURITY;

-- Org admins can read and manage all mappings for their org
CREATE POLICY "org_admins_can_manage_deputy_mappings"
  ON public.deputy_employee_mappings FOR ALL
  USING (
    organization_id = current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.user_id = auth.uid()
        AND (staff.is_org_admin = true OR staff.is_super_admin = true)
    )
  );

-- Fast lookups during sync
CREATE INDEX idx_deputy_mappings_org_employee
  ON public.deputy_employee_mappings (organization_id, deputy_employee_id);

CREATE INDEX idx_deputy_mappings_confirmed
  ON public.deputy_employee_mappings (organization_id, is_confirmed)
  WHERE is_confirmed = true AND is_ignored = false;

-- Sanity check
DO $$
BEGIN
  ASSERT (SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'deputy_employee_mappings'
  )), 'deputy_employee_mappings table was not created';
  RAISE NOTICE 'deputy_employee_mappings ✓';
END $$;
