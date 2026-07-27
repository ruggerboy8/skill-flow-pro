-- Guard the release RPCs so a "hollow" evaluation (no scored evaluation_items)
-- can never be made visible to staff. This is the last line of defense behind
-- the client-side submit guard: even if a zero-item eval somehow reaches
-- status='submitted', releasing it (single or bulk) will skip it.
--
-- Only the p_visible = true (release) branches gain the EXISTS check. Un-release
-- (p_visible = false) is intentionally left unconditional so an already-exposed
-- hollow eval can always be pulled back.
--
-- APPLIED LIVE 2026-07-24 (Phase C U4). Idempotent CREATE OR REPLACE.
-- Editor (or let Lovable pick it up from main) AFTER the frontend guards ship,
-- so the two move together. Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.bulk_release_evaluations(
  p_location_id uuid, p_period_type text, p_quarter text, p_year integer,
  p_visible boolean, p_released_by uuid)
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
      UPDATE evaluations e SET
        is_visible_to_staff = true,
        released_at = COALESCE(released_at, now()),
        released_by = COALESCE(released_by, p_released_by)
      WHERE e.location_id = p_location_id
        AND e.status = 'submitted'
        AND e.program_year = p_year
        AND e.quarter = p_quarter
        AND e.type = 'Quarterly'
        AND EXISTS (SELECT 1 FROM evaluation_items ei
                    WHERE ei.evaluation_id = e.id AND ei.observer_score IS NOT NULL);
    ELSE
      UPDATE evaluations e SET
        is_visible_to_staff = true,
        released_at = COALESCE(released_at, now()),
        released_by = COALESCE(released_by, p_released_by)
      WHERE e.location_id = p_location_id
        AND e.status = 'submitted'
        AND e.program_year = p_year
        AND e.type = 'Baseline'
        AND EXISTS (SELECT 1 FROM evaluation_items ei
                    WHERE ei.evaluation_id = e.id AND ei.observer_score IS NOT NULL);
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

CREATE OR REPLACE FUNCTION public.release_single_evaluation(
  p_eval_id uuid, p_visible boolean, p_released_by uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_staff record;
  v_eval_location_id uuid;
  v_scored_count int;
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
    -- Refuse to release an eval that has no scored items.
    SELECT count(*) INTO v_scored_count FROM evaluation_items
      WHERE evaluation_id = p_eval_id AND observer_score IS NOT NULL;
    IF v_scored_count = 0 THEN
      RAISE EXCEPTION 'Cannot release an evaluation with no scores recorded';
    END IF;

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
