CREATE OR REPLACE FUNCTION public.compute_eval_self_scores(p_eval_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_type text;
  v_quarter text;
  v_created_at timestamptz;
  v_window_end date;
  v_window_start date;
BEGIN
  SELECT staff_id, type, quarter, created_at
    INTO v_staff_id, v_type, v_quarter, v_created_at
  FROM public.evaluations
  WHERE id = p_eval_id;

  IF v_staff_id IS NULL THEN
    RETURN;
  END IF;

  -- Only Quarterly evals get aggregated self-scores. Baseline = observer-only.
  IF v_type IS DISTINCT FROM 'Quarterly' OR v_quarter IS NULL THEN
    RETURN;
  END IF;

  -- Rolling 12-week window ending at eval creation (inclusive).
  -- This reflects the work the coach actually observed leading up to the eval,
  -- regardless of which calendar quarter the eval is labelled.
  v_window_end := v_created_at::date;
  v_window_start := v_window_end - INTERVAL '12 weeks';

  WITH agg AS (
    SELECT
      ws.competency_id,
      ROUND(AVG(ws.performance_score)::numeric, 1) AS avg_score,
      COUNT(*)::int AS n
    FROM public.view_weekly_scores_with_competency ws
    WHERE ws.staff_id = v_staff_id
      AND ws.competency_id IS NOT NULL
      AND ws.performance_score IS NOT NULL
      AND ws.performance_score > 0
      AND ws.week_of BETWEEN v_window_start AND v_window_end
    GROUP BY ws.competency_id
  )
  UPDATE public.evaluation_items ei
  SET
    self_score_avg = a.avg_score,
    self_score_sample_size = a.n,
    self_score = CASE WHEN a.n >= 3 THEN ROUND(a.avg_score)::int ELSE NULL END,
    self_is_na = false,
    self_note = NULL
  FROM agg a
  WHERE ei.evaluation_id = p_eval_id
    AND ei.competency_id = a.competency_id;

  UPDATE public.evaluation_items ei
  SET
    self_score_avg = NULL,
    self_score_sample_size = 0,
    self_score = NULL,
    self_is_na = false,
    self_note = NULL
  WHERE ei.evaluation_id = p_eval_id
    AND NOT EXISTS (
      SELECT 1 FROM public.view_weekly_scores_with_competency ws
      WHERE ws.staff_id = v_staff_id
        AND ws.competency_id = ei.competency_id
        AND ws.performance_score IS NOT NULL
        AND ws.performance_score > 0
        AND ws.week_of BETWEEN v_window_start AND v_window_end
    );
END;
$$;