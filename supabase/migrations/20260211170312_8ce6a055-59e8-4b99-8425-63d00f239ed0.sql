
-- =====================================================
-- Phase 1: Evaluation Review & Focus Selection Schema
-- =====================================================

-- 1. Add delivery-tracking columns to evaluations
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS released_at        timestamptz,
  ADD COLUMN IF NOT EXISTS released_by        uuid REFERENCES public.staff(id),
  ADD COLUMN IF NOT EXISTS viewed_at          timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_at    timestamptz,
  ADD COLUMN IF NOT EXISTS review_payload     jsonb,
  ADD COLUMN IF NOT EXISTS focus_selected_at  timestamptz;

-- 2. Create staff_quarter_focus table
CREATE TABLE IF NOT EXISTS public.staff_quarter_focus (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id       uuid NOT NULL REFERENCES public.staff(id),
  evaluation_id  uuid NOT NULL REFERENCES public.evaluations(id),
  action_id      bigint NOT NULL REFERENCES public.pro_moves(action_id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(evaluation_id, action_id)
);

ALTER TABLE public.staff_quarter_focus ENABLE ROW LEVEL SECURITY;

-- Staff can read own rows
CREATE POLICY "Staff can read own focus"
  ON public.staff_quarter_focus FOR SELECT
  USING (staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()));

-- Staff can insert own rows
CREATE POLICY "Staff can insert own focus"
  ON public.staff_quarter_focus FOR INSERT
  WITH CHECK (staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()));

-- Staff can delete own rows (for replace semantics)
CREATE POLICY "Staff can delete own focus"
  ON public.staff_quarter_focus FOR DELETE
  USING (staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()));

-- Coaches/admins can read all focus rows
CREATE POLICY "Coaches and admins can read all focus"
  ON public.staff_quarter_focus FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.staff
      WHERE user_id = auth.uid()
        AND (is_coach = true OR is_super_admin = true OR is_org_admin = true)
    )
  );

-- 3. RPC: mark_eval_viewed
CREATE OR REPLACE FUNCTION public.mark_eval_viewed(p_eval_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_eval record;
BEGIN
  -- Resolve caller's staff record
  SELECT id INTO v_staff_id
    FROM staff WHERE user_id = auth.uid();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff record not found for current user';
  END IF;

  -- Fetch evaluation and validate
  SELECT staff_id, status, is_visible_to_staff, viewed_at
    INTO v_eval
    FROM evaluations WHERE id = p_eval_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evaluation not found';
  END IF;
  IF v_eval.staff_id <> v_staff_id THEN
    RAISE EXCEPTION 'Not your evaluation';
  END IF;
  IF v_eval.status <> 'submitted' THEN
    RAISE EXCEPTION 'Evaluation is not submitted';
  END IF;
  IF v_eval.is_visible_to_staff = false THEN
    RAISE EXCEPTION 'Evaluation is not released';
  END IF;

  -- Idempotent: only set once
  UPDATE evaluations
    SET viewed_at = COALESCE(viewed_at, now())
    WHERE id = p_eval_id;
END;
$$;

-- 4. RPC: compute_and_store_review_payload
CREATE OR REPLACE FUNCTION public.compute_and_store_review_payload(p_eval_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_eval record;
  v_payload jsonb;
  v_scored_count int;
  v_domain_summaries jsonb;
  v_priorities jsonb;
  v_strengths jsonb;
  v_alignment jsonb;
  v_gaps jsonb;
  v_recommended_ids jsonb;
  v_sparse boolean := false;
BEGIN
  -- Resolve caller
  SELECT id INTO v_staff_id FROM staff WHERE user_id = auth.uid();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff record not found';
  END IF;

  -- Fetch and validate
  SELECT staff_id, status, is_visible_to_staff, review_payload
    INTO v_eval FROM evaluations WHERE id = p_eval_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;
  IF v_eval.staff_id <> v_staff_id THEN RAISE EXCEPTION 'Not your evaluation'; END IF;
  IF v_eval.status <> 'submitted' THEN RAISE EXCEPTION 'Evaluation is not submitted'; END IF;
  IF v_eval.is_visible_to_staff = false THEN RAISE EXCEPTION 'Evaluation is not released'; END IF;

  -- Idempotent: return existing payload if already computed
  IF v_eval.review_payload IS NOT NULL THEN
    RETURN v_eval.review_payload;
  END IF;

  -- Count scored items
  SELECT count(*) INTO v_scored_count
    FROM evaluation_items
    WHERE evaluation_id = p_eval_id AND observer_score IS NOT NULL;

  -- Always compute domain summaries
  SELECT COALESCE(jsonb_agg(row_to_json(ds) ORDER BY ds.domain_name), '[]'::jsonb)
    INTO v_domain_summaries
    FROM (
      SELECT
        domain_name,
        round(avg(observer_score)::numeric, 2) AS observer_avg,
        round(avg(self_score)::numeric, 2) AS self_avg,
        count(*) AS count_scored
      FROM evaluation_items
      WHERE evaluation_id = p_eval_id AND observer_score IS NOT NULL
      GROUP BY domain_name
    ) ds;

  -- Sparse check
  IF v_scored_count < 4 THEN
    v_sparse := true;
    v_priorities := '[]'::jsonb;
    v_strengths := '[]'::jsonb;
    v_alignment := '[]'::jsonb;
    v_gaps := '[]'::jsonb;
    v_recommended_ids := '[]'::jsonb;
  ELSE
    -- Priorities: lowest observer_score, tie-break by gap desc, domain avg asc, competency_id asc
    SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.rn), '[]'::jsonb)
      INTO v_priorities
      FROM (
        SELECT ei.competency_id, ei.competency_name_snapshot AS competency_name,
               ei.domain_name, ei.observer_score, ei.self_score,
               (ei.self_score - ei.observer_score) AS gap,
               ei.observer_note, ei.self_note,
               ROW_NUMBER() OVER (
                 ORDER BY ei.observer_score ASC,
                          (ei.self_score - ei.observer_score) DESC,
                          da.domain_avg ASC,
                          ei.competency_id ASC
               ) AS rn
        FROM evaluation_items ei
        LEFT JOIN (
          SELECT domain_name, avg(observer_score) AS domain_avg
          FROM evaluation_items
          WHERE evaluation_id = p_eval_id AND observer_score IS NOT NULL
          GROUP BY domain_name
        ) da ON da.domain_name = ei.domain_name
        WHERE ei.evaluation_id = p_eval_id AND ei.observer_score IS NOT NULL
      ) p
      WHERE p.rn <= 3;

    -- Recommended competency_ids from priorities
    SELECT COALESCE(jsonb_agg(p.competency_id ORDER BY p.rn), '[]'::jsonb)
      INTO v_recommended_ids
      FROM (
        SELECT ei.competency_id,
               ROW_NUMBER() OVER (
                 ORDER BY ei.observer_score ASC,
                          (ei.self_score - ei.observer_score) DESC,
                          ei.competency_id ASC
               ) AS rn
        FROM evaluation_items ei
        WHERE ei.evaluation_id = p_eval_id AND ei.observer_score IS NOT NULL
      ) p
      WHERE p.rn <= 3;

    -- Strengths: highest observer_score >= 3, tie-break by smallest gap, competency_id
    SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.rn), '[]'::jsonb)
      INTO v_strengths
      FROM (
        SELECT ei.competency_id, ei.competency_name_snapshot AS competency_name,
               ei.domain_name, ei.observer_score, ei.self_score,
               (ei.self_score - ei.observer_score) AS gap,
               ei.observer_note, ei.self_note,
               ROW_NUMBER() OVER (
                 ORDER BY ei.observer_score DESC,
                          abs(ei.self_score - ei.observer_score) ASC,
                          ei.competency_id ASC
               ) AS rn
        FROM evaluation_items ei
        WHERE ei.evaluation_id = p_eval_id
          AND ei.observer_score IS NOT NULL
          AND ei.observer_score >= 3
      ) s
      WHERE s.rn <= 4;

    -- Alignment: smallest gap, observer >= 3, both scores present
    SELECT COALESCE(jsonb_agg(row_to_json(a) ORDER BY a.rn), '[]'::jsonb)
      INTO v_alignment
      FROM (
        SELECT ei.competency_id, ei.competency_name_snapshot AS competency_name,
               ei.domain_name, ei.observer_score, ei.self_score,
               (ei.self_score - ei.observer_score) AS gap,
               ei.observer_note, ei.self_note,
               ROW_NUMBER() OVER (
                 ORDER BY abs(ei.self_score - ei.observer_score) ASC,
                          ei.competency_id ASC
               ) AS rn
        FROM evaluation_items ei
        WHERE ei.evaluation_id = p_eval_id
          AND ei.observer_score IS NOT NULL
          AND ei.self_score IS NOT NULL
          AND ei.observer_score >= 3
      ) a
      WHERE a.rn <= 3;

    -- Gaps: self - observer >= 2
    SELECT COALESCE(jsonb_agg(row_to_json(g) ORDER BY g.rn), '[]'::jsonb)
      INTO v_gaps
      FROM (
        SELECT ei.competency_id, ei.competency_name_snapshot AS competency_name,
               ei.domain_name, ei.observer_score, ei.self_score,
               (ei.self_score - ei.observer_score) AS gap,
               ei.observer_note, ei.self_note,
               ROW_NUMBER() OVER (
                 ORDER BY (ei.self_score - ei.observer_score) DESC,
                          ei.competency_id ASC
               ) AS rn
        FROM evaluation_items ei
        WHERE ei.evaluation_id = p_eval_id
          AND ei.observer_score IS NOT NULL
          AND ei.self_score IS NOT NULL
          AND (ei.self_score - ei.observer_score) >= 2
      ) g
      WHERE g.rn <= 3;
  END IF;

  -- Build final payload
  v_payload := jsonb_build_object(
    'version', 1,
    'computed_at', now(),
    'sparse', v_sparse,
    'priorities', v_priorities,
    'strengths', v_strengths,
    'alignment', v_alignment,
    'gaps', v_gaps,
    'domain_summaries', v_domain_summaries,
    'recommended_competency_ids', v_recommended_ids
  );

  -- Store
  UPDATE evaluations SET review_payload = v_payload WHERE id = p_eval_id;

  RETURN v_payload;
END;
$$;

-- 5. RPC: save_eval_acknowledgement_and_focus
CREATE OR REPLACE FUNCTION public.save_eval_acknowledgement_and_focus(
  p_eval_id uuid,
  p_action_ids bigint[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_eval record;
  v_len int;
  v_valid_count int;
  v_aid bigint;
BEGIN
  -- Resolve caller
  SELECT id INTO v_staff_id FROM staff WHERE user_id = auth.uid();
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'Staff record not found';
  END IF;

  -- Fetch and validate evaluation
  SELECT staff_id, status, is_visible_to_staff
    INTO v_eval FROM evaluations WHERE id = p_eval_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;
  IF v_eval.staff_id <> v_staff_id THEN RAISE EXCEPTION 'Not your evaluation'; END IF;
  IF v_eval.status <> 'submitted' THEN RAISE EXCEPTION 'Evaluation is not submitted'; END IF;
  IF v_eval.is_visible_to_staff = false THEN RAISE EXCEPTION 'Evaluation is not released'; END IF;

  v_len := COALESCE(array_length(p_action_ids, 1), 0);

  -- Validate array length
  IF v_len > 3 THEN
    RAISE EXCEPTION 'Maximum 3 focus items allowed';
  END IF;

  -- Always set acknowledged_at (idempotent)
  UPDATE evaluations
    SET acknowledged_at = COALESCE(acknowledged_at, now())
    WHERE id = p_eval_id;

  -- If action_ids provided, validate and replace focus
  IF v_len > 0 THEN
    -- Validate all action_ids map to competencies in this evaluation's items
    SELECT count(DISTINCT pm.action_id) INTO v_valid_count
      FROM unnest(p_action_ids) AS aid(action_id)
      JOIN pro_moves pm ON pm.action_id = aid.action_id
      JOIN evaluation_items ei ON ei.competency_id = pm.competency_id
        AND ei.evaluation_id = p_eval_id;

    IF v_valid_count <> v_len THEN
      RAISE EXCEPTION 'One or more action_ids are not relevant to this evaluation';
    END IF;

    -- Delete existing focus for this evaluation
    DELETE FROM staff_quarter_focus WHERE evaluation_id = p_eval_id;

    -- Insert new focus rows
    FOREACH v_aid IN ARRAY p_action_ids LOOP
      INSERT INTO staff_quarter_focus (staff_id, evaluation_id, action_id)
        VALUES (v_staff_id, p_eval_id, v_aid);
    END LOOP;

    -- Set focus_selected_at
    UPDATE evaluations SET focus_selected_at = now() WHERE id = p_eval_id;
  END IF;
END;
$$;

-- 6. RPC: release_single_evaluation
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

-- 7. RPC: bulk_release_evaluations
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
