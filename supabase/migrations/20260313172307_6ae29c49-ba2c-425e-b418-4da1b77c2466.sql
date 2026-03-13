
-- 1) Add future-proof columns to pro_moves
ALTER TABLE public.pro_moves
  ADD COLUMN IF NOT EXISTS owner_org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS copied_from_action_id bigint REFERENCES public.pro_moves(action_id) ON DELETE SET NULL;

-- Add check constraint for source values
ALTER TABLE public.pro_moves
  ADD CONSTRAINT pro_moves_source_check CHECK (source IN ('platform', 'org_custom'));

-- Index for org-owned moves lookup
CREATE INDEX IF NOT EXISTS idx_pro_moves_owner_org_id ON public.pro_moves(owner_org_id) WHERE owner_org_id IS NOT NULL;

-- 2) Harden RLS on organization_pro_move_overrides
-- Drop overly permissive policies
DROP POLICY IF EXISTS "authenticated_read_overrides" ON public.organization_pro_move_overrides;
DROP POLICY IF EXISTS "org_admin_manage_overrides" ON public.organization_pro_move_overrides;

-- SELECT: same-org members or super admin
CREATE POLICY "overrides_select_own_org" ON public.organization_pro_move_overrides
  FOR SELECT TO authenticated
  USING (
    org_id = get_user_org_id(auth.uid())
    OR is_super_admin(auth.uid())
  );

-- INSERT/UPDATE/DELETE: org admin for own org, or super admin
CREATE POLICY "overrides_manage_own_org" ON public.organization_pro_move_overrides
  FOR ALL TO authenticated
  USING (
    (org_id = get_user_org_id(auth.uid()) AND EXISTS (
      SELECT 1 FROM staff WHERE staff.user_id = auth.uid() AND (staff.is_org_admin = true OR staff.is_super_admin = true)
    ))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    (org_id = get_user_org_id(auth.uid()) AND EXISTS (
      SELECT 1 FROM staff WHERE staff.user_id = auth.uid() AND (staff.is_org_admin = true OR staff.is_super_admin = true)
    ))
    OR is_super_admin(auth.uid())
  );

-- 3) Create RPC for org-visible pro moves
CREATE OR REPLACE FUNCTION public.org_visible_pro_moves(
  p_org_id uuid,
  p_role_id integer DEFAULT NULL
)
RETURNS TABLE (
  action_id bigint,
  action_statement text,
  competency_id bigint,
  role_id bigint,
  practice_types text[],
  source text,
  owner_org_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH org_type AS (
    SELECT o.practice_type
    FROM organizations o
    WHERE o.id = p_org_id
  ),
  hidden AS (
    SELECT opo.pro_move_id
    FROM organization_pro_move_overrides opo
    WHERE opo.org_id = p_org_id AND opo.is_hidden = true
  )
  SELECT
    pm.action_id,
    pm.action_statement,
    pm.competency_id,
    pm.role_id,
    pm.practice_types,
    pm.source,
    pm.owner_org_id
  FROM pro_moves pm, org_type ot
  WHERE pm.active = true
    AND (
      -- Platform moves matching org practice type
      (pm.owner_org_id IS NULL AND pm.practice_types @> ARRAY[ot.practice_type])
      OR
      -- Org-owned custom moves
      (pm.owner_org_id = p_org_id AND pm.source = 'org_custom')
    )
    -- Exclude hidden platform moves
    AND pm.action_id NOT IN (SELECT pro_move_id FROM hidden WHERE pm.owner_org_id IS NULL)
    -- Optional role filter
    AND (p_role_id IS NULL OR pm.role_id = p_role_id)
  ORDER BY pm.action_id;
$$;
