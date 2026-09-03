-- PML-2c: one shared eligibility rule. org_visible_pro_moves becomes THE
-- rule for "which pro moves may this org see for this role" — the sequencer
-- already calls it (sequencer-rank/index.ts), and after this migration the
-- planner picker, AI-suggest, and the org library all call the identical
-- function instead of re-implementing the practice-type/hidden-list/org-moves
-- logic three separate ways (docs/audits/tenant-model-audit-2026-09-03.md
-- finding D).
--
-- Contract is unchanged (same args, same return columns) — post-PML-2a the
-- org branch (pm.owner_org_id = p_org_id) finally matches real rows, since
-- org-custom moves now live in pro_moves instead of the unrelated
-- organization_pro_moves table.

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
      -- Org-owned custom moves (post-2a: real pro_moves rows)
      (pm.owner_org_id = p_org_id)
    )
    -- Exclude hidden platform moves
    AND pm.action_id NOT IN (SELECT pro_move_id FROM hidden WHERE pm.owner_org_id IS NULL)
    -- Optional role filter
    AND (p_role_id IS NULL OR pm.role_id = p_role_id)
  ORDER BY pm.action_id;
$$;

DO $$
BEGIN
  RAISE NOTICE 'PML-2c: org_visible_pro_moves is the single eligibility rule (org branch now matches owner_org_id rows directly)';
END $$;
