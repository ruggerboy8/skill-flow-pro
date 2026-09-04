-- PML-2d: consolidate org-id resolution on current_user_org_id(), and drop
-- the two dead RPCs the audit flagged (docs/audits/tenant-model-audit-2026-09-03.md
-- findings E and F).
--
-- get_user_org_id(uuid) and current_user_org_id() already compute the exact
-- same COALESCE(staff.organization_id, location-chain) logic as of
-- 20260820023000 (cor2_fix_org_group_id_confusion); that migration's own
-- header comment says as much and lists every RLS policy still calling
-- get_user_org_id(auth.uid()) directly (confirmed live via pg_policy):
-- weekly_assignments, practice_groups, locations, weekly_scores,
-- organization_pro_moves, organization_pro_move_overrides,
-- organization_pro_move_content_overrides. This migration recreates each of
-- those policies to call current_user_org_id() instead, then drops
-- get_user_org_id only once a DO block confirms pg_policies has no more
-- references to it.

select set_config('app.change_reason', 'PML-2d: consolidate org-id resolvers on current_user_org_id()', true);

-- =====================================================
-- 1. weekly_assignments (from 20260312224749)
-- =====================================================
DROP POLICY IF EXISTS "Users view own org assignments" ON public.weekly_assignments;
CREATE POLICY "Users view own org assignments"
ON public.weekly_assignments FOR SELECT TO authenticated
USING (
  org_id = public.current_user_org_id()
);

DROP POLICY IF EXISTS "Org admins manage own org assignments" ON public.weekly_assignments;
CREATE POLICY "Org admins manage own org assignments"
ON public.weekly_assignments FOR ALL TO authenticated
USING (
  org_id = public.current_user_org_id()
  AND EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND (staff.is_org_admin = true OR staff.is_super_admin = true)
  )
)
WITH CHECK (
  org_id = public.current_user_org_id()
  AND EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND (staff.is_org_admin = true OR staff.is_super_admin = true)
  )
);

-- =====================================================
-- 2. practice_groups (from 20260312224749)
-- =====================================================
DROP POLICY IF EXISTS "Org admins manage own practice_groups" ON public.practice_groups;
CREATE POLICY "Org admins manage own practice_groups"
ON public.practice_groups FOR ALL TO authenticated
USING (
  organization_id = public.current_user_org_id()
  AND EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND (staff.is_org_admin = true OR staff.is_super_admin = true)
  )
)
WITH CHECK (
  organization_id = public.current_user_org_id()
  AND EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND (staff.is_org_admin = true OR staff.is_super_admin = true)
  )
);

-- =====================================================
-- 3. locations (from 20260312224749)
-- =====================================================
DROP POLICY IF EXISTS "Org admins manage own locations" ON public.locations;
CREATE POLICY "Org admins manage own locations"
ON public.locations FOR ALL TO authenticated
USING (
  group_id IN (
    SELECT id FROM practice_groups
    WHERE organization_id = public.current_user_org_id()
  )
  AND EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND (staff.is_org_admin = true OR staff.is_super_admin = true)
  )
)
WITH CHECK (
  group_id IN (
    SELECT id FROM practice_groups
    WHERE organization_id = public.current_user_org_id()
  )
  AND EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND (staff.is_org_admin = true OR staff.is_super_admin = true)
  )
);

-- =====================================================
-- 4. weekly_scores (from 20260313150029)
-- =====================================================
DROP POLICY IF EXISTS "Coaches can read org scores" ON public.weekly_scores;
CREATE POLICY "Coaches can read org scores"
ON public.weekly_scores
FOR SELECT
TO public
USING (
  CASE
    WHEN is_super_admin(auth.uid()) THEN true
    WHEN EXISTS (
      SELECT 1 FROM staff WHERE user_id = auth.uid() AND is_coach = true
    ) THEN EXISTS (
      SELECT 1
      FROM staff target
      JOIN locations l ON l.id = target.primary_location_id
      JOIN practice_groups pg ON pg.id = l.group_id
      WHERE target.id = weekly_scores.staff_id
        AND pg.organization_id = public.current_user_org_id()
    )
    ELSE false
  END
);

-- =====================================================
-- 5. organization_pro_move_overrides (from 20260313172307)
-- =====================================================
DROP POLICY IF EXISTS "overrides_select_own_org" ON public.organization_pro_move_overrides;
CREATE POLICY "overrides_select_own_org" ON public.organization_pro_move_overrides
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "overrides_manage_own_org" ON public.organization_pro_move_overrides;
CREATE POLICY "overrides_manage_own_org" ON public.organization_pro_move_overrides
  FOR ALL TO authenticated
  USING (
    (org_id = public.current_user_org_id() AND EXISTS (
      SELECT 1 FROM staff WHERE staff.user_id = auth.uid() AND (staff.is_org_admin = true OR staff.is_super_admin = true)
    ))
    OR is_super_admin(auth.uid())
  )
  WITH CHECK (
    (org_id = public.current_user_org_id() AND EXISTS (
      SELECT 1 FROM staff WHERE staff.user_id = auth.uid() AND (staff.is_org_admin = true OR staff.is_super_admin = true)
    ))
    OR is_super_admin(auth.uid())
  );

-- =====================================================
-- 6. organization_pro_moves (from 20260612143951)
-- =====================================================
DROP POLICY IF EXISTS "org_pro_moves_select_own_org" ON public.organization_pro_moves;
CREATE POLICY org_pro_moves_select_own_org ON public.organization_pro_moves
  FOR SELECT USING (
    (org_id = public.current_user_org_id()) OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "org_pro_moves_manage_own_org" ON public.organization_pro_moves;
CREATE POLICY org_pro_moves_manage_own_org ON public.organization_pro_moves
  FOR ALL USING (
    ((org_id = public.current_user_org_id()) AND EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.user_id = auth.uid()
        AND (staff.is_org_admin = true OR staff.is_super_admin = true)
    )) OR is_super_admin(auth.uid())
  ) WITH CHECK (
    ((org_id = public.current_user_org_id()) AND EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.user_id = auth.uid()
        AND (staff.is_org_admin = true OR staff.is_super_admin = true)
    )) OR is_super_admin(auth.uid())
  );

-- =====================================================
-- 7. organization_pro_move_content_overrides (from 20260612143951)
-- =====================================================
DROP POLICY IF EXISTS "org_pmc_overrides_select_own_org" ON public.organization_pro_move_content_overrides;
CREATE POLICY org_pmc_overrides_select_own_org ON public.organization_pro_move_content_overrides
  FOR SELECT USING (
    (org_id = public.current_user_org_id()) OR is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS "org_pmc_overrides_manage_own_org" ON public.organization_pro_move_content_overrides;
CREATE POLICY org_pmc_overrides_manage_own_org ON public.organization_pro_move_content_overrides
  FOR ALL USING (
    ((org_id = public.current_user_org_id()) AND EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.user_id = auth.uid()
        AND (staff.is_org_admin = true OR staff.is_super_admin = true)
    )) OR is_super_admin(auth.uid())
  ) WITH CHECK (
    ((org_id = public.current_user_org_id()) AND EXISTS (
      SELECT 1 FROM public.staff
      WHERE staff.user_id = auth.uid()
        AND (staff.is_org_admin = true OR staff.is_super_admin = true)
    )) OR is_super_admin(auth.uid())
  );

-- =====================================================
-- 8. Drop get_user_org_id only if nothing in pg_policies references it any
--    more. Guards against this migration running against a database where
--    some other, not-yet-updated policy still calls it. Raises instead of
--    dropping a function something still depends on.
-- =====================================================
DO $$
DECLARE
  v_still_referenced int;
BEGIN
  SELECT count(*) INTO v_still_referenced
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      coalesce(qual, '') LIKE '%get_user_org_id%'
      OR coalesce(with_check, '') LIKE '%get_user_org_id%'
    );

  IF v_still_referenced > 0 THEN
    RAISE EXCEPTION 'PML-2d: % RLS polic(ies) still reference get_user_org_id, not dropping the function', v_still_referenced;
  END IF;

  DROP FUNCTION IF EXISTS public.get_user_org_id(uuid);
  RAISE NOTICE 'PML-2d: get_user_org_id(uuid) dropped, current_user_org_id() is the one org-id resolver';
END $$;

-- =====================================================
-- 9. Drop the dead resolve_role_display_name RPC. The app resolves org role
--    labels entirely through useRoleDisplayNames (client-side hook reading
--    organization_role_names); this RPC has no callers.
-- =====================================================
DROP FUNCTION IF EXISTS public.resolve_role_display_name(uuid, bigint);

DO $$
BEGIN
  RAISE NOTICE 'PML-2d: resolve_role_display_name dropped (dead; useRoleDisplayNames is the live mechanism)';
END $$;
