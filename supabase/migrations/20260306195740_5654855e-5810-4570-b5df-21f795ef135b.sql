CREATE TABLE public.organizations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  slug           TEXT UNIQUE NOT NULL,
  practice_type  TEXT NOT NULL DEFAULT 'pediatric'
                   CHECK (practice_type IN ('pediatric', 'general')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_insert_superadmin_only"
  ON public.organizations FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true));

CREATE POLICY "org_update_superadmin_only"
  ON public.organizations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND is_super_admin = true));

ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS role_code TEXT;
UPDATE public.roles SET role_code = 'front_desk'       WHERE role_id = 1;
UPDATE public.roles SET role_code = 'dental_assistant' WHERE role_id = 2;
UPDATE public.roles SET role_code = 'office_manager'   WHERE role_id = 3;
UPDATE public.roles SET role_code = 'doctor'           WHERE role_id = 4;

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

CREATE POLICY "role_names_write_org_admin"
  ON public.organization_role_names FOR ALL
  USING (EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND (is_super_admin = true OR is_org_admin = true)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND (is_super_admin = true OR is_org_admin = true)));

CREATE OR REPLACE FUNCTION public.resolve_role_display_name(p_org_id UUID, p_role_id BIGINT)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT display_name FROM organization_role_names WHERE org_id = p_org_id AND role_id = p_role_id),
    (SELECT role_name FROM roles WHERE role_id = p_role_id)
  );
$$;