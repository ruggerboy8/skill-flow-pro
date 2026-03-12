-- ============================================================
-- Evaluation RLS & RPC Org Scope
-- ============================================================
-- Replaces the broad is_coach_or_admin() policies on evaluations
-- and evaluation_items with org-scoped equivalents. Also adds an
-- org ownership check to release_single_evaluation and
-- bulk_release_evaluations so that org admins / coaches can only
-- act on evaluations within their own organization.
--
-- Super admins (is_super_admin = true) bypass all org checks.
-- ============================================================

-- -------------------------------------------------------
-- 1. evaluations RLS
-- -------------------------------------------------------

DROP POLICY IF EXISTS "Coaches can manage evaluations" ON public.evaluations;

CREATE POLICY "Coaches can manage evaluations within their org"
ON public.evaluations
FOR ALL
USING (
  -- Super admins can see everything
  EXISTS (
    SELECT 1 FROM public.staff
    WHERE user_id = auth.uid() AND is_super_admin = true
  )
  OR
  -- Coaches / org admins can only see evals within their org,
  -- resolved via location → practice_group → organization chain.
  (
    is_coach_or_admin(auth.uid())
    AND location_id IN (
      SELECT l.id
      FROM public.locations l
      JOIN public.practice_groups pg ON pg.id = l.group_id
      WHERE pg.organization_id = current_user_org_id()
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.staff
    WHERE user_id = auth.uid() AND is_super_admin = true
  )
  OR
  (
    is_coach_or_admin(auth.uid())
    AND location_id IN (
      SELECT l.id
      FROM public.locations l
      JOIN public.practice_groups pg ON pg.id = l.group_id
      WHERE pg.organization_id = current_user_org_id()
    )
  )
);

-- -------------------------------------------------------
-- 2. evaluation_items RLS
-- -------------------------------------------------------
-- evaluation_items already joins through evaluations, so the
-- check just needs to verify the parent eval is in-org.

DROP POLICY IF EXISTS "Coaches can manage evaluation items" ON public.evaluation_items;

CREATE POLICY "Coaches can manage evaluation items within their org"
ON public.evaluation_items
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.evaluations e
    WHERE e.id = evaluation_items.evaluation_id
      AND (
        -- Super admin bypass
        EXISTS (
          SELECT 1 FROM public.staff
          WHERE user_id = auth.uid() AND is_super_admin = true
        )
        OR
        -- Org-scoped coach/admin check
        (
          is_coach_or_admin(auth.uid())
          AND e.location_id IN (
            SELECT l.id
            FROM public.locations l
            JOIN public.practice_groups pg ON pg.id = l.group_id
            WHERE pg.organization_id = current_user_org_id()
          )
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.evaluations e
    WHERE e.id = evaluation_items.evaluation_id
      AND (
        EXISTS (
          SELECT 1 FROM public.staff
          WHERE user_id = auth.uid() AND is_super_admin = true
        )
        OR
        (
          is_coach_or_admin(auth.uid())
          AND e.location_id IN (
            SELECT l.id
            FROM public.locations l
            JOIN public.practice_groups pg ON pg.id = l.group_id
            WHERE pg.organization_id = current_user_org_id()
          )
        )
      )
  )
);

-- -------------------------------------------------------
-- 3. release_single_evaluation — add org ownership check
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.release_single_evaluation(
  p_eval_id uuid,
  p_visible boolean,
  p_released_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_staff record;
BEGIN
  -- Validate caller is coach/admin
  SELECT id, is_coach, is_super_admin, is_org_admin
    INTO v_caller_staff FROM staff WHERE user_id = auth.uid();
  IF v_caller_staff IS NULL THEN
    RAISE EXCEPTION 'Staff record not found';
  END IF;
  IF NOT (v_caller_staff.is_coach OR v_caller_staff.is_super_admin OR v_caller_staff.is_org_admin) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Org ownership check: non-super-admins may only release evals within their org
  IF NOT v_caller_staff.is_super_admin THEN
    PERFORM 1
      FROM evaluations e
      JOIN locations l ON l.id = e.location_id
      JOIN practice_groups pg ON pg.id = l.group_id
      WHERE e.id = p_eval_id
        AND pg.organization_id = current_user_org_id();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Forbidden: evaluation does not belong to your organization';
    END IF;
  END IF;

  IF p_visible THEN
    UPDATE evaluations SET
      is_visible_to_staff = true,
      released_at = COALESCE(released_at, now()),
      released_by = COALESCE(released_by, p_released_by)
    WHERE id = p_eval_id AND status = 'submitted';
  ELSE
    UPDATE evaluations SET
      is_visible_to_staff = false
    WHERE id = p_eval_id;
  END IF;
END;
$$;

-- -------------------------------------------------------
-- 4. bulk_release_evaluations — add org ownership check
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bulk_release_evaluations(
  p_location_id uuid,
  p_period_type text,
  p_quarter text,
  p_year int,
  p_visible boolean,
  p_released_by uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_staff record;
  v_count int;
BEGIN
  -- Validate caller is coach/admin
  SELECT id, is_coach, is_super_admin, is_org_admin
    INTO v_caller_staff FROM staff WHERE user_id = auth.uid();
  IF v_caller_staff IS NULL THEN
    RAISE EXCEPTION 'Staff record not found';
  END IF;
  IF NOT (v_caller_staff.is_coach OR v_caller_staff.is_super_admin OR v_caller_staff.is_org_admin) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Org ownership check: non-super-admins may only bulk-release within their org
  IF NOT v_caller_staff.is_super_admin THEN
    PERFORM 1
      FROM locations l
      JOIN practice_groups pg ON pg.id = l.group_id
      WHERE l.id = p_location_id
        AND pg.organization_id = current_user_org_id();
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Forbidden: location does not belong to your organization';
    END IF;
  END IF;

  IF p_visible THEN
    IF p_period_type = 'Quarterly' THEN
      UPDATE evaluations SET
        is_visible_to_staff = true,
        released_at = COALESCE(released_at, now()),
        released_by = COALESCE(released_by, p_released_by)
      WHERE location_id = p_location_id
        AND status = 'submitted'
        AND program_year = p_year
        AND quarter = p_quarter
        AND type = 'Quarterly';
    ELSE
      UPDATE evaluations SET
        is_visible_to_staff = true,
        released_at = COALESCE(released_at, now()),
        released_by = COALESCE(released_by, p_released_by)
      WHERE location_id = p_location_id
        AND status = 'submitted'
        AND program_year = p_year
        AND type = 'Baseline';
    END IF;
  ELSE
    IF p_period_type = 'Quarterly' THEN
      UPDATE evaluations SET is_visible_to_staff = false
      WHERE location_id = p_location_id
        AND status = 'submitted'
        AND program_year = p_year
        AND quarter = p_quarter
        AND type = 'Quarterly';
    ELSE
      UPDATE evaluations SET is_visible_to_staff = false
      WHERE location_id = p_location_id
        AND status = 'submitted'
        AND program_year = p_year
        AND type = 'Baseline';
    END IF;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- -------------------------------------------------------
-- Sanity check
-- -------------------------------------------------------
DO $$
BEGIN
  -- Confirm the new policies exist
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'evaluations'
      AND policyname = 'Coaches can manage evaluations within their org'
  ), 'evaluations policy not found';

  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'evaluation_items'
      AND policyname = 'Coaches can manage evaluation items within their org'
  ), 'evaluation_items policy not found';

  RAISE NOTICE 'eval_rls_org_scope: policies verified OK';
END;
$$;
