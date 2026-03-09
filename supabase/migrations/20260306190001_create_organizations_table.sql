-- Migration: Create organizations table (tenant layer)
-- This adds the top-level tenant entity above practice_groups.
-- Organizations own a set of practice_groups, locations, staff, and pro move visibility.
-- Tenants are fully isolated — users in one organization cannot see another's data.

-- 1. Create organizations table
CREATE TABLE public.organizations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  slug           TEXT UNIQUE NOT NULL,
  practice_type  TEXT NOT NULL DEFAULT 'pediatric'
                   CHECK (practice_type IN ('pediatric', 'general')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 2. Enable RLS immediately
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Platform admins (is_super_admin) can read all organizations.
-- All other authenticated users can read only their own organization
-- (resolved via practice_groups → locations → staff chain).
-- Write operations are restricted to platform admins only.
CREATE POLICY "org_select_own_or_superadmin"
  ON public.organizations
  FOR SELECT
  USING (
    -- Super admin sees all
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE user_id = auth.uid() AND is_super_admin = true
    )
    OR
    -- Regular user sees only their organization
    id IN (
      SELECT pg.organization_id
      FROM public.practice_groups pg
      JOIN public.locations l ON l.group_id = pg.id
      JOIN public.staff s ON s.primary_location_id = l.id
      WHERE s.user_id = auth.uid()
    )
  );

CREATE POLICY "org_insert_superadmin_only"
  ON public.organizations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE user_id = auth.uid() AND is_super_admin = true
    )
  );

CREATE POLICY "org_update_superadmin_only"
  ON public.organizations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE user_id = auth.uid() AND is_super_admin = true
    )
  );

-- 3. Add internal role code to roles table (used by code, never shown to users)
--    role_name remains the platform-level default display name.
--    role_code is the stable internal identifier for each role category.
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS role_code TEXT;

UPDATE public.roles SET role_code = 'front_desk'      WHERE role_id = 1;
UPDATE public.roles SET role_code = 'dental_assistant' WHERE role_id = 2;
UPDATE public.roles SET role_code = 'office_manager'   WHERE role_id = 3;
UPDATE public.roles SET role_code = 'doctor'           WHERE role_id = 4;

-- 4. Create organization_role_names — per-org display name overrides
--    If a row exists here, the app uses this name instead of roles.role_name.
--    Example: org_id=UK-practice, role_id=1 → display_name='Receptionist'
--             org_id=UK-practice, role_id=2 → display_name='Dental Nurse'
CREATE TABLE public.organization_role_names (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role_id      BIGINT NOT NULL REFERENCES public.roles(role_id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  UNIQUE (org_id, role_id)
);

ALTER TABLE public.organization_role_names ENABLE ROW LEVEL SECURITY;

-- Users can read their own org's role name overrides
CREATE POLICY "role_names_select_own_org"
  ON public.organization_role_names
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE user_id = auth.uid() AND is_super_admin = true
    )
    OR
    org_id IN (
      SELECT pg.organization_id
      FROM public.practice_groups pg
      JOIN public.locations l ON l.group_id = pg.id
      JOIN public.staff s ON s.primary_location_id = l.id
      WHERE s.user_id = auth.uid()
    )
  );

-- Only org admins and super admins can modify role name overrides
CREATE POLICY "role_names_write_org_admin"
  ON public.organization_role_names
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE user_id = auth.uid()
        AND (is_super_admin = true OR is_org_admin = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE user_id = auth.uid()
        AND (is_super_admin = true OR is_org_admin = true)
    )
  );

-- 5. Helper function: resolve display name for a role within a given organization
--    Returns org override if one exists, otherwise returns the platform default role_name.
CREATE OR REPLACE FUNCTION public.resolve_role_display_name(p_org_id UUID, p_role_id BIGINT)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT display_name FROM organization_role_names
     WHERE org_id = p_org_id AND role_id = p_role_id),
    (SELECT role_name FROM roles WHERE role_id = p_role_id)
  );
$$;
