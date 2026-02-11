
-- Add super admin bypass to mark_eval_viewed
CREATE OR REPLACE FUNCTION public.mark_eval_viewed(p_eval_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eval evaluations%ROWTYPE;
  v_caller_staff staff%ROWTYPE;
BEGIN
  SELECT * INTO v_eval FROM evaluations WHERE id = p_eval_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;

  -- Check caller is the eval owner OR a super admin
  SELECT * INTO v_caller_staff FROM staff WHERE user_id = auth.uid();
  IF v_caller_staff.id IS NULL THEN RAISE EXCEPTION 'No staff record'; END IF;

  IF v_caller_staff.id != v_eval.staff_id AND NOT v_caller_staff.is_super_admin THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT v_eval.is_visible_to_staff THEN RAISE EXCEPTION 'Evaluation not visible'; END IF;

  UPDATE evaluations SET viewed_at = COALESCE(viewed_at, now()) WHERE id = p_eval_id;
END;
$$;

-- Add super admin bypass to compute_and_store_review_payload
CREATE OR REPLACE FUNCTION public.compute_and_store_review_payload(p_eval_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eval evaluations%ROWTYPE;
  v_caller_staff staff%ROWTYPE;
  v_payload jsonb;
  v_items jsonb;
  v_priorities jsonb;
  v_strengths jsonb;
  v_alignment jsonb;
  v_gaps jsonb;
  v_domain_avgs jsonb;
  v_item record;
BEGIN
  SELECT * INTO v_eval FROM evaluations WHERE id = p_eval_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;

  SELECT * INTO v_caller_staff FROM staff WHERE user_id = auth.uid();
  IF v_caller_staff.id IS NULL THEN RAISE EXCEPTION 'No staff record'; END IF;

  IF v_caller_staff.id != v_eval.staff_id AND NOT v_caller_staff.is_super_admin THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Return existing payload if already computed
  IF v_eval.review_payload IS NOT NULL THEN
    RETURN v_eval.review_payload;
  END IF;

  -- Compute domain averages
  SELECT jsonb_agg(da ORDER BY da->>'domain_name') INTO v_domain_avgs
  FROM (
    SELECT jsonb_build_object(
      'domain_id', domain_id,
      'domain_name', domain_name,
      'observer_avg', round(avg(observer_score)::numeric, 2),
      'self_avg', round(avg(self_score)::numeric, 2),
      'count', count(*)
    ) as da
    FROM evaluation_items
    WHERE evaluation_id = p_eval_id
      AND observer_score IS NOT NULL
      AND observer_is_na IS NOT TRUE
    GROUP BY domain_id, domain_name
  ) sub;

  -- Build scored items with domain avg
  SELECT jsonb_agg(item_row) INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'competency_id', ei.competency_id,
      'competency_name', ei.competency_name_snapshot,
      'domain_id', ei.domain_id,
      'domain_name', ei.domain_name,
      'observer_score', ei.observer_score,
      'self_score', ei.self_score,
      'domain_avg', COALESCE((
        SELECT round(avg(ei2.observer_score)::numeric, 2)
        FROM evaluation_items ei2
        WHERE ei2.evaluation_id = p_eval_id
          AND ei2.domain_id = ei.domain_id
          AND ei2.observer_score IS NOT NULL
          AND ei2.observer_is_na IS NOT TRUE
      ), 0)
    ) as item_row
    FROM evaluation_items ei
    WHERE ei.evaluation_id = p_eval_id
      AND ei.observer_score IS NOT NULL
      AND ei.observer_is_na IS NOT TRUE
      AND ei.self_is_na IS NOT TRUE
  ) sub;

  -- Priorities: lowest observer, break ties by largest gap desc, then domain avg asc
  SELECT jsonb_agg(p) INTO v_priorities
  FROM (
    SELECT item as p FROM jsonb_array_elements(v_items) item
    ORDER BY (item->>'observer_score')::numeric ASC,
             ((item->>'self_score')::numeric - (item->>'observer_score')::numeric) DESC,
             (item->>'domain_avg')::numeric ASC,
             (item->>'competency_id')::int ASC
    LIMIT 5
  ) sub;

  -- Strengths: highest observer, break ties by smallest abs gap
  SELECT jsonb_agg(s) INTO v_strengths
  FROM (
    SELECT item as s FROM jsonb_array_elements(v_items) item
    ORDER BY (item->>'observer_score')::numeric DESC,
             abs((item->>'self_score')::numeric - (item->>'observer_score')::numeric) ASC,
             (item->>'competency_id')::int ASC
    LIMIT 5
  ) sub;

  -- Alignment: smallest absolute gap
  SELECT jsonb_agg(a) INTO v_alignment
  FROM (
    SELECT item as a FROM jsonb_array_elements(v_items) item
    ORDER BY abs((item->>'self_score')::numeric - (item->>'observer_score')::numeric) ASC,
             (item->>'competency_id')::int ASC
    LIMIT 5
  ) sub;

  -- Gaps: largest self-minus-observer (overestimation)
  SELECT jsonb_agg(g) INTO v_gaps
  FROM (
    SELECT item as g FROM jsonb_array_elements(v_items) item
    ORDER BY ((item->>'self_score')::numeric - (item->>'observer_score')::numeric) DESC,
             (item->>'competency_id')::int ASC
    LIMIT 5
  ) sub;

  v_payload := jsonb_build_object(
    'priorities', COALESCE(v_priorities, '[]'::jsonb),
    'strengths', COALESCE(v_strengths, '[]'::jsonb),
    'alignment', COALESCE(v_alignment, '[]'::jsonb),
    'gaps', COALESCE(v_gaps, '[]'::jsonb),
    'domain_averages', COALESCE(v_domain_avgs, '[]'::jsonb),
    'computed_at', to_jsonb(now())
  );

  UPDATE evaluations SET review_payload = v_payload WHERE id = p_eval_id;

  RETURN v_payload;
END;
$$;

-- Add super admin bypass to save_eval_acknowledgement_and_focus
CREATE OR REPLACE FUNCTION public.save_eval_acknowledgement_and_focus(
  p_eval_id uuid,
  p_action_ids integer[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_eval evaluations%ROWTYPE;
  v_caller_staff staff%ROWTYPE;
  v_action_id integer;
BEGIN
  SELECT * INTO v_eval FROM evaluations WHERE id = p_eval_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;

  SELECT * INTO v_caller_staff FROM staff WHERE user_id = auth.uid();
  IF v_caller_staff.id IS NULL THEN RAISE EXCEPTION 'No staff record'; END IF;

  IF v_caller_staff.id != v_eval.staff_id AND NOT v_caller_staff.is_super_admin THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT v_eval.is_visible_to_staff THEN RAISE EXCEPTION 'Evaluation not visible'; END IF;

  -- Always set acknowledged_at (idempotent)
  UPDATE evaluations SET acknowledged_at = COALESCE(acknowledged_at, now()) WHERE id = p_eval_id;

  -- Only update focus if action_ids provided
  IF array_length(p_action_ids, 1) > 0 THEN
    DELETE FROM staff_quarter_focus WHERE evaluation_id = p_eval_id;

    FOREACH v_action_id IN ARRAY p_action_ids LOOP
      INSERT INTO staff_quarter_focus (staff_id, evaluation_id, action_id)
      VALUES (v_eval.staff_id, p_eval_id, v_action_id);
    END LOOP;

    UPDATE evaluations SET focus_selected_at = now() WHERE id = p_eval_id;
  END IF;
END;
$$;
