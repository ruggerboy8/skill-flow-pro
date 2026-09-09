-- PML-2c: one shared eligibility rule. org_visible_pro_moves becomes THE
-- rule for "which pro moves may this org see for this role"; the sequencer
-- already calls it (sequencer-rank/index.ts), and after this migration the
-- planner picker, AI-suggest, and the org library all call the identical
-- function instead of re-implementing the practice-type/hidden-list/org-moves
-- logic three separate ways (docs/audits/tenant-model-audit-2026-09-03.md
-- finding D).
--
-- Contract is unchanged (same args, same return columns). Post-PML-2a the
-- org branch (pm.owner_org_id = p_org_id) finally matches real rows, since
-- org-custom moves now live in pro_moves instead of the unrelated
-- organization_pro_moves table.
--
-- CALLER GUARD (Codex review, CONFIRMED against live prod): this function is
-- SECURITY DEFINER and trusts a caller-supplied p_org_id. Post-fold, that
-- p_org_id resolves real tenant-authored content (org_custom pro_moves), so
-- an authenticated caller passing another org's id would read that org's
-- custom moves cross-org. Converted to plpgsql (same signature, same return
-- table) to add a guard: permit when the caller is a service context
-- (service_role, or auth.uid() IS NULL -- sequencer-rank forwards the
-- calling user's JWT, so a real end user always hits the org/admin checks
-- below, never this branch), when p_org_id is the caller's own org via
-- current_user_org_id(), or when the caller is a super admin or platform
-- admin. Anything else raises 42501.

select set_config('app.change_reason', 'PML-2c: org_visible_pro_moves is the single eligibility rule', true);

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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    auth.role() = 'service_role'
    OR auth.uid() IS NULL
    OR p_org_id = current_user_org_id()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      LEFT JOIN public.user_capabilities uc ON uc.staff_id = s.id
      WHERE s.user_id = auth.uid()
        AND (COALESCE(s.is_super_admin, false) OR COALESCE(uc.is_platform_admin, false))
    )
  ) THEN
    RAISE EXCEPTION 'forbidden: cannot view another org''s pro moves' USING errcode = '42501';
  END IF;

  RETURN QUERY
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
      -- Org-owned custom moves (post-2a: real pro_moves rows)
      (pm.owner_org_id = p_org_id)
    )
    -- Exclude hidden platform moves
    AND pm.action_id NOT IN (SELECT pro_move_id FROM hidden WHERE pm.owner_org_id IS NULL)
    -- Optional role filter
    AND (p_role_id IS NULL OR pm.role_id = p_role_id)
  ORDER BY pm.action_id;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'PML-2c: org_visible_pro_moves is the single eligibility rule (org branch now matches owner_org_id rows directly, caller guard added)';
END $$;
