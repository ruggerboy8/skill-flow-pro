-- P0: Enterprise data isolation fixes
-- 1. Create org-scoped coach check helper
CREATE OR REPLACE FUNCTION public.is_same_org_eval(p_user_id uuid, p_eval_location_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM staff s
    JOIN locations l ON l.id = s.primary_location_id
    JOIN practice_groups pg ON pg.id = l.group_id
    WHERE s.user_id = p_user_id
      AND pg.organization_id = (
        SELECT pg2.organization_id
        FROM locations l2
        JOIN practice_groups pg2 ON pg2.id = l2.group_id
        WHERE l2.id = p_eval_location_id
      )
  )
$$;

-- 2. Fix evaluations RLS: replace global coach policy with org-scoped one
DROP POLICY IF EXISTS "Coaches can manage evaluations" ON evaluations;

CREATE POLICY "Coaches can manage evaluations"
ON evaluations
FOR ALL
TO public
USING (
  CASE
    WHEN is_super_admin(auth.uid()) THEN true
    WHEN is_coach_or_admin(auth.uid()) THEN is_same_org_eval(auth.uid(), location_id)
    ELSE false
  END
)
WITH CHECK (
  CASE
    WHEN is_super_admin(auth.uid()) THEN true
    WHEN is_coach_or_admin(auth.uid()) THEN is_same_org_eval(auth.uid(), location_id)
    ELSE false
  END
);

-- 3. Fix evaluation_items RLS: inherit org scope from evaluations
DROP POLICY IF EXISTS "Coaches can manage evaluation items" ON evaluation_items;

CREATE POLICY "Coaches can manage evaluation items"
ON evaluation_items
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM evaluations e
    WHERE e.id = evaluation_items.evaluation_id
    AND (
      CASE
        WHEN is_super_admin(auth.uid()) THEN true
        WHEN is_coach_or_admin(auth.uid()) THEN is_same_org_eval(auth.uid(), e.location_id)
        ELSE false
      END
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM evaluations e
    WHERE e.id = evaluation_items.evaluation_id
    AND (
      CASE
        WHEN is_super_admin(auth.uid()) THEN true
        WHEN is_coach_or_admin(auth.uid()) THEN is_same_org_eval(auth.uid(), e.location_id)
        ELSE false
      END
    )
  )
);

-- 4. Fix weekly_scores RLS: scope coach read to own org
DROP POLICY IF EXISTS "Coaches can read all scores" ON weekly_scores;

CREATE POLICY "Coaches can read org scores"
ON weekly_scores
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
        AND pg.organization_id = get_user_org_id(auth.uid())
    )
    ELSE false
  END
);

-- 5. Fix release RPCs: add org ownership validation
CREATE OR REPLACE FUNCTION public.release_single_evaluation(p_eval_id uuid, p_visible boolean, p_released_by uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_staff record;
  v_eval_location_id uuid;
BEGIN
  SELECT id, is_coach, is_super_admin, is_org_admin
    INTO v_caller_staff FROM staff WHERE user_id = auth.uid();
  IF v_caller_staff IS NULL THEN
    RAISE EXCEPTION 'Staff record not found';
  END IF;
  IF NOT (v_caller_staff.is_coach OR v_caller_staff.is_super_admin OR v_caller_staff.is_org_admin) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Org boundary check (skip for super admins)
  IF NOT v_caller_staff.is_super_admin THEN
    SELECT location_id INTO v_eval_location_id FROM evaluations WHERE id = p_eval_id;
    IF NOT is_same_org_eval(auth.uid(), v_eval_location_id) THEN
      RAISE EXCEPTION 'Cannot release evaluations outside your organization';
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
$function$;

CREATE OR REPLACE FUNCTION public.bulk_release_evaluations(p_location_id uuid, p_period_type text, p_quarter text, p_year integer, p_visible boolean, p_released_by uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_staff record;
  v_count int;
BEGIN
  SELECT id, is_coach, is_super_admin, is_org_admin
    INTO v_caller_staff FROM staff WHERE user_id = auth.uid();
  IF v_caller_staff IS NULL THEN
    RAISE EXCEPTION 'Staff record not found';
  END IF;
  IF NOT (v_caller_staff.is_coach OR v_caller_staff.is_super_admin OR v_caller_staff.is_org_admin) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Org boundary check (skip for super admins)
  IF NOT v_caller_staff.is_super_admin THEN
    IF NOT is_same_org_eval(auth.uid(), p_location_id) THEN
      RAISE EXCEPTION 'Cannot release evaluations outside your organization';
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
$function$;