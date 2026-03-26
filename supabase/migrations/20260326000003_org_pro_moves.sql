-- Migration: organization_pro_moves
-- Allows org admins to create new pro moves private to their organization.
-- These are additive — they do not replace or modify the platform library.
--
-- UUIDs are used (not BIGINTs) to prevent collision with platform pro_moves.action_id.
-- The application layer uses a `source` discriminator ('platform' | 'org') to
-- distinguish between the two pools when building assignments.
--
-- Must run after 20260306190002 (defines current_user_org_id()).

CREATE TABLE IF NOT EXISTS public.organization_pro_moves (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_statement TEXT        NOT NULL,
  context          TEXT,
  role_id          BIGINT      REFERENCES public.roles(role_id) ON DELETE SET NULL,
  competency_id    BIGINT      REFERENCES public.competencies(id) ON DELETE SET NULL,
  practice_types   TEXT[]      NOT NULL DEFAULT '{}',
  active           BOOLEAN     NOT NULL DEFAULT true,
  sort_order       INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID        REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by       UUID        REFERENCES public.staff(id) ON DELETE SET NULL
);

ALTER TABLE public.organization_pro_moves ENABLE ROW LEVEL SECURITY;

-- Platform admins: full access
CREATE POLICY "org_pro_moves_platform_admin"
  ON public.organization_pro_moves
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.is_super_admin = true
    )
  );

-- Org admins with can_manage_library: read/write their org's custom moves
CREATE POLICY "org_pro_moves_org_admin"
  ON public.organization_pro_moves
  FOR ALL
  USING (
    org_id = public.current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.is_org_admin = true
    )
  );

-- All org members: read active custom moves (for assignment builder + learner views)
CREATE POLICY "org_pro_moves_members_read"
  ON public.organization_pro_moves
  FOR SELECT
  USING (
    org_id = public.current_user_org_id()
    AND active = true
  );

-- Sanity check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'organization_pro_moves'
  ) THEN
    RAISE EXCEPTION 'organization_pro_moves table was not created';
  END IF;
  RAISE NOTICE 'organization_pro_moves created successfully';
END $$;
