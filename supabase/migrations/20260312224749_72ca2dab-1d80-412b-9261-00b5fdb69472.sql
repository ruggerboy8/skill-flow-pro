
-- ============================================================
-- Enterprise Isolation: constraints, get_user_org_id(), RLS, backfill
-- ============================================================

-- 1. SECURITY DEFINER helper
CREATE OR REPLACE FUNCTION public.get_user_org_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg.organization_id
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  JOIN practice_groups pg ON pg.id = l.group_id
  WHERE s.user_id = p_user_id
  LIMIT 1;
$$;

-- 2. Update CHECK constraints to allow source = 'org'
ALTER TABLE weekly_assignments DROP CONSTRAINT weekly_assignments_source_check;
ALTER TABLE weekly_assignments ADD CONSTRAINT weekly_assignments_source_check
  CHECK (source = ANY (ARRAY['onboarding', 'global', 'org']));

ALTER TABLE weekly_assignments DROP CONSTRAINT weekly_assignments_check;
ALTER TABLE weekly_assignments ADD CONSTRAINT weekly_assignments_check
  CHECK (
    (source = 'onboarding' AND location_id IS NOT NULL AND org_id IS NULL)
    OR (source = 'global' AND location_id IS NULL)
    OR (source = 'org' AND org_id IS NOT NULL AND location_id IS NULL)
  );

-- 3. Backfill Alcan's global assignments to org-scoped
UPDATE weekly_assignments
SET org_id = 'a1ca0000-0000-0000-0000-000000000001',
    source = 'org'
WHERE source = 'global'
  AND org_id IS NULL
  AND status = 'locked';

-- 4. Drop old permissive global-read policy (causes bleedover)
DROP POLICY IF EXISTS "Authenticated users can read global assignments" ON weekly_assignments;

-- 5. Drop broken org global assignments policy
DROP POLICY IF EXISTS "Users view own org global assignments" ON weekly_assignments;

-- 6. Add correct org-scoped SELECT policy
CREATE POLICY "Users view own org assignments"
ON public.weekly_assignments FOR SELECT TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
);

-- 7. Org-admin write policy for weekly_assignments
CREATE POLICY "Org admins manage own org assignments"
ON public.weekly_assignments FOR ALL TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND (staff.is_org_admin = true OR staff.is_super_admin = true)
  )
)
WITH CHECK (
  org_id = public.get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND (staff.is_org_admin = true OR staff.is_super_admin = true)
  )
);

-- 8. Org-admin write policies for practice_groups
CREATE POLICY "Org admins manage own practice_groups"
ON public.practice_groups FOR ALL TO authenticated
USING (
  organization_id = public.get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND (staff.is_org_admin = true OR staff.is_super_admin = true)
  )
)
WITH CHECK (
  organization_id = public.get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND (staff.is_org_admin = true OR staff.is_super_admin = true)
  )
);

-- 9. Org-admin write policies for locations
CREATE POLICY "Org admins manage own locations"
ON public.locations FOR ALL TO authenticated
USING (
  group_id IN (
    SELECT id FROM practice_groups
    WHERE organization_id = public.get_user_org_id(auth.uid())
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
    WHERE organization_id = public.get_user_org_id(auth.uid())
  )
  AND EXISTS (
    SELECT 1 FROM staff
    WHERE staff.user_id = auth.uid()
    AND (staff.is_org_admin = true OR staff.is_super_admin = true)
  )
);

-- Sanity check
DO $$
DECLARE
  v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt FROM weekly_assignments WHERE source = 'global' AND org_id IS NULL AND status = 'locked';
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: % rows still have source=global and org_id IS NULL', v_cnt;
  END IF;
END $$;
