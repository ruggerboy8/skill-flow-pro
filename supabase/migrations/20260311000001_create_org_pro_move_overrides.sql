-- Migration: organization_pro_move_overrides
-- Allows per-org visibility control over the platform pro move library.
-- Phase 1: is_hidden toggle only (no content editing).
-- The schema includes hidden_by for future audit trail.

CREATE TABLE IF NOT EXISTS public.organization_pro_move_overrides (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pro_move_id  BIGINT      NOT NULL REFERENCES public.pro_moves(action_id) ON DELETE CASCADE,
  is_hidden    BOOLEAN     NOT NULL DEFAULT false,
  hidden_at    TIMESTAMPTZ,
  hidden_by    UUID        REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, pro_move_id)
);

ALTER TABLE public.organization_pro_move_overrides ENABLE ROW LEVEL SECURITY;

-- Platform admins have full access
CREATE POLICY "org_pro_move_overrides_platform_admin"
  ON public.organization_pro_move_overrides
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND s.is_super_admin = true
    )
  );

-- Org admins and library managers can read/write their own org's overrides
CREATE POLICY "org_pro_move_overrides_org_admin"
  ON public.organization_pro_move_overrides
  FOR ALL
  USING (
    org_id = current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.user_id = auth.uid()
        AND (s.is_org_admin = true)
    )
  );

-- All authenticated users in the org can read (for filtering pro moves in the app)
CREATE POLICY "org_pro_move_overrides_members_read"
  ON public.organization_pro_move_overrides
  FOR SELECT
  USING (org_id = current_user_org_id());

-- Sanity check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'organization_pro_move_overrides'
  ) THEN
    RAISE EXCEPTION 'organization_pro_move_overrides table was not created';
  END IF;
  RAISE NOTICE 'organization_pro_move_overrides created successfully';
END $$;
