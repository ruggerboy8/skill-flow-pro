
CREATE TABLE public.organization_pro_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_statement text NOT NULL,
  description text,
  role_id integer CONSTRAINT organization_pro_moves_role_id_fkey REFERENCES public.roles(role_id) ON DELETE SET NULL,
  competency_id integer CONSTRAINT organization_pro_moves_competency_id_fkey REFERENCES public.competencies(competency_id) ON DELETE SET NULL,
  practice_types text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_pro_moves_org ON public.organization_pro_moves(org_id) WHERE active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_pro_moves TO authenticated;
GRANT ALL ON public.organization_pro_moves TO service_role;

ALTER TABLE public.organization_pro_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_pro_moves_select_own_org ON public.organization_pro_moves
  FOR SELECT USING (
    (org_id = get_user_org_id(auth.uid())) OR is_super_admin(auth.uid())
  );

CREATE POLICY org_pro_moves_manage_own_org ON public.organization_pro_moves
  FOR ALL USING (
    ((org_id = get_user_org_id(auth.uid())) AND EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.user_id = auth.uid()
        AND (staff.is_org_admin = true OR staff.is_super_admin = true)
    )) OR is_super_admin(auth.uid())
  ) WITH CHECK (
    ((org_id = get_user_org_id(auth.uid())) AND EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.user_id = auth.uid()
        AND (staff.is_org_admin = true OR staff.is_super_admin = true)
    )) OR is_super_admin(auth.uid())
  );

CREATE TABLE public.organization_pro_move_content_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pro_move_id integer NOT NULL REFERENCES public.pro_moves(action_id) ON DELETE CASCADE,
  custom_statement text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, pro_move_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_pro_move_content_overrides TO authenticated;
GRANT ALL ON public.organization_pro_move_content_overrides TO service_role;

ALTER TABLE public.organization_pro_move_content_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_pmc_overrides_select_own_org ON public.organization_pro_move_content_overrides
  FOR SELECT USING (
    (org_id = get_user_org_id(auth.uid())) OR is_super_admin(auth.uid())
  );

CREATE POLICY org_pmc_overrides_manage_own_org ON public.organization_pro_move_content_overrides
  FOR ALL USING (
    ((org_id = get_user_org_id(auth.uid())) AND EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.user_id = auth.uid()
        AND (staff.is_org_admin = true OR staff.is_super_admin = true)
    )) OR is_super_admin(auth.uid())
  ) WITH CHECK (
    ((org_id = get_user_org_id(auth.uid())) AND EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.user_id = auth.uid()
        AND (staff.is_org_admin = true OR staff.is_super_admin = true)
    )) OR is_super_admin(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_org_pro_moves_updated_at
  BEFORE UPDATE ON public.organization_pro_moves
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TRIGGER trg_org_pmc_overrides_updated_at
  BEFORE UPDATE ON public.organization_pro_move_content_overrides
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
