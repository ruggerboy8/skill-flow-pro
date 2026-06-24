-- Phase 2 rebuild: review_payload v4 adds a per-domain full breakdown (every
-- competency with score, Glow/Grow, and N/A) for the staff per-domain walkthrough.
-- Additive: all v2/v3 fields (domain_summaries, top/bottom candidates) are retained
-- so the existing wizard keeps working. Version bump 3->4 recomputes stale payloads
-- on next view. Applied to the live project via MCP; kept here for repo parity.
-- Idempotent (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.compute_and_store_review_payload(p_eval_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_eval evaluations%ROWTYPE;
  v_caller_staff staff%ROWTYPE;
  v_payload jsonb;
  v_domain_avgs jsonb;
  v_domain_breakdown jsonb;
  v_top jsonb;
  v_bottom jsonb;
  v_scored_count int;
  v_sparse boolean;
  v_top_ids int[];
  v_top_used_fallback boolean := false;
BEGIN
  SELECT * INTO v_eval FROM evaluations WHERE id = p_eval_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evaluation not found'; END IF;

  SELECT * INTO v_caller_staff FROM staff WHERE user_id = auth.uid();
  IF v_caller_staff.id IS NULL THEN RAISE EXCEPTION 'No staff record'; END IF;

  IF v_caller_staff.id != v_eval.staff_id AND NOT v_caller_staff.is_super_admin THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF NOT v_caller_staff.is_super_admin THEN
    IF v_eval.status != 'submitted' THEN RAISE EXCEPTION 'Evaluation is not submitted'; END IF;
    IF NOT v_eval.is_visible_to_staff THEN RAISE EXCEPTION 'Evaluation not visible'; END IF;
  END IF;

  IF v_eval.review_payload IS NOT NULL
     AND (v_eval.review_payload->>'version')::int = 4 THEN
    RETURN v_eval.review_payload;
  END IF;

  SELECT count(*) INTO v_scored_count
  FROM evaluation_items
  WHERE evaluation_id = p_eval_id
    AND observer_score IS NOT NULL
    AND observer_is_na IS NOT TRUE;

  v_sparse := v_scored_count < 4;

  SELECT jsonb_agg(row_val ORDER BY row_val->>'domain_name') INTO v_domain_avgs
  FROM (
    SELECT jsonb_build_object(
      'domain_name', domain_name,
      'observer_avg', round(avg(observer_score)::numeric, 2),
      'self_avg', round(avg(
        CASE WHEN self_is_na IS NOT TRUE AND self_score IS NOT NULL
             THEN self_score END
      )::numeric, 2),
      'count_scored', count(*)
    ) as row_val
    FROM evaluation_items
    WHERE evaluation_id = p_eval_id
      AND observer_score IS NOT NULL
      AND observer_is_na IS NOT TRUE
    GROUP BY domain_name
  ) sub;

  SELECT jsonb_agg(dom ORDER BY dom->>'domain_name') INTO v_domain_breakdown
  FROM (
    SELECT jsonb_build_object(
      'domain_name', domain_name,
      'observer_avg', round(avg(observer_score) FILTER (
        WHERE observer_score IS NOT NULL AND observer_is_na IS NOT TRUE
      )::numeric, 2),
      'items', jsonb_agg(jsonb_build_object(
        'competency_id', competency_id,
        'competency_name', competency_name_snapshot,
        'domain_name', domain_name,
        'observer_score', observer_score,
        'observer_is_na', COALESCE(observer_is_na, false),
        'observer_glow', observer_glow,
        'observer_grow', observer_grow,
        'observer_note', observer_note,
        'self_score', self_score,
        'gap', CASE WHEN self_score IS NOT NULL AND observer_score IS NOT NULL
                    THEN self_score - observer_score ELSE NULL END
      ) ORDER BY competency_id)
    ) AS dom
    FROM evaluation_items
    WHERE evaluation_id = p_eval_id
    GROUP BY domain_name
  ) sub;

  IF v_sparse THEN
    v_top := '[]'::jsonb;
    v_bottom := '[]'::jsonb;
    v_top_ids := ARRAY[]::int[];
  ELSE
    SELECT jsonb_agg(item), array_agg((item->>'competency_id')::int)
    INTO v_top, v_top_ids
    FROM (
      SELECT jsonb_build_object(
        'competency_id', competency_id, 'competency_name', competency_name_snapshot,
        'domain_name', domain_name, 'observer_score', observer_score, 'self_score', self_score,
        'gap', CASE WHEN self_score IS NOT NULL THEN self_score - observer_score ELSE NULL END,
        'observer_note', observer_note, 'observer_glow', observer_glow, 'observer_grow', observer_grow,
        'self_note', self_note
      ) as item
      FROM evaluation_items
      WHERE evaluation_id = p_eval_id
        AND observer_score IS NOT NULL AND observer_is_na IS NOT TRUE AND observer_score >= 3
      ORDER BY observer_score DESC, abs(COALESCE(self_score, observer_score) - observer_score) ASC, competency_id ASC
      LIMIT 4
    ) sub;

    v_top := COALESCE(v_top, '[]'::jsonb);
    v_top_ids := COALESCE(v_top_ids, ARRAY[]::int[]);

    IF jsonb_array_length(v_top) = 0 THEN
      v_top_used_fallback := true;
      SELECT jsonb_agg(item), array_agg((item->>'competency_id')::int)
      INTO v_top, v_top_ids
      FROM (
        SELECT jsonb_build_object(
          'competency_id', competency_id, 'competency_name', competency_name_snapshot,
          'domain_name', domain_name, 'observer_score', observer_score, 'self_score', self_score,
          'gap', CASE WHEN self_score IS NOT NULL THEN self_score - observer_score ELSE NULL END,
          'observer_note', observer_note, 'observer_glow', observer_glow, 'observer_grow', observer_grow,
          'self_note', self_note
        ) as item
        FROM evaluation_items
        WHERE evaluation_id = p_eval_id
          AND observer_score IS NOT NULL AND observer_is_na IS NOT TRUE
        ORDER BY observer_score DESC, abs(COALESCE(self_score, observer_score) - observer_score) ASC, competency_id ASC
        LIMIT 4
      ) sub;
      v_top := COALESCE(v_top, '[]'::jsonb);
      v_top_ids := COALESCE(v_top_ids, ARRAY[]::int[]);
    END IF;

    SELECT jsonb_agg(item) INTO v_bottom
    FROM (
      SELECT jsonb_build_object(
        'competency_id', competency_id, 'competency_name', competency_name_snapshot,
        'domain_name', domain_name, 'observer_score', observer_score, 'self_score', self_score,
        'gap', CASE WHEN self_score IS NOT NULL THEN self_score - observer_score ELSE NULL END,
        'observer_note', observer_note, 'observer_glow', observer_glow, 'observer_grow', observer_grow,
        'self_note', self_note
      ) as item
      FROM evaluation_items
      WHERE evaluation_id = p_eval_id
        AND observer_score IS NOT NULL AND observer_is_na IS NOT TRUE
        AND NOT (competency_id = ANY(v_top_ids)) AND observer_score < 4
      ORDER BY observer_score ASC, (COALESCE(self_score, observer_score) - observer_score) DESC, competency_id ASC
      LIMIT 6
    ) sub;
    v_bottom := COALESCE(v_bottom, '[]'::jsonb);
  END IF;

  v_payload := jsonb_build_object(
    'version', 4,
    'computed_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'sparse', v_sparse,
    'domain_summaries', COALESCE(v_domain_avgs, '[]'::jsonb),
    'domain_breakdown', COALESCE(v_domain_breakdown, '[]'::jsonb),
    'top_candidates', v_top,
    'bottom_candidates', v_bottom,
    'top_used_fallback', v_top_used_fallback
  );

  UPDATE evaluations SET review_payload = v_payload WHERE id = p_eval_id;
  RETURN v_payload;
END;
$function$;
