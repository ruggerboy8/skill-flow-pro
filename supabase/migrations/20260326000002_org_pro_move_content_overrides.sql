-- Migration: organization_pro_move_content_overrides
-- Allows org admins to customize the text of existing platform pro moves.
-- Phase 2 of org-level pro move customization (Phase 1 was visibility toggle).
--
-- NULL fields mean "use the platform default". Only set fields that differ.
-- Must run after 20260306190002 (defines current_user_org_id()).

CREATE TABLE IF NOT EXISTS public.organization_pro_move_content_overrides (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pro_move_id      BIGINT      NOT NULL REFERENCES public.pro_moves(action_id) ON DELETE CASCADE,
  custom_statement TEXT,           -- NULL = use platform action_statement
  custom_context   TEXT,           -- NULL = use platform context/description
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID        REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES public.staff(id) ON DELETE SET NULL,
  UNIQUE (org_id, pro_move_id)
);

ALTER TABLE public.organization_pro_move_content_overrides ENABLE ROW LEVEL SECURITY;

-- Platform admins: full access
CREATE POLICY "content_overrides_platform_admin"
  ON public.organization_pro_move_content_overrides
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.is_super_admin = true
    )
  );

-- Org admins: read/write their own org's overrides
CREATE POLICY "content_overrides_org_admin"
  ON public.organization_pro_move_content_overrides
  FOR ALL
  USING (
    org_id = public.current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.is_org_admin = true
    )
  );

-- All org members: read own org overrides (for rendering customized text in learner view)
CREATE POLICY "content_overrides_members_read"
  ON public.organization_pro_move_content_overrides
  FOR SELECT
  USING (org_id = public.current_user_org_id());

-- Sanity check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'organization_pro_move_content_overrides'
  ) THEN
    RAISE EXCEPTION 'organization_pro_move_content_overrides table was not created';
  END IF;
  RAISE NOTICE 'organization_pro_move_content_overrides created successfully';
END $$;
