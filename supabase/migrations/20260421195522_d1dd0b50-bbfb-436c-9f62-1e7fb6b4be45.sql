-- Add columns to evaluation_items for aggregated self-score precision
ALTER TABLE public.evaluation_items
  ADD COLUMN IF NOT EXISTS self_score_avg numeric(2,1),
  ADD COLUMN IF NOT EXISTS self_score_sample_size integer DEFAULT 0;

-- Function to compute aggregated self-scores from weekly performance submissions.
-- Quarterly only. Baseline evals are skipped (observer-only).
-- For each competency on the eval, averages performance_score (>0) from
-- view_weekly_scores_with_competency where week_of falls in the quarter window
-- (location-tz aware via location program calendar — uses calendar quarter).
-- Threshold: n < 3 → leaves self_score NULL so UI can show "Not enough data".
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
  v_year int;
  v_location_id uuid;
  v_tz text;
  v_q_start date;
  v_q_end date;
  v_q_start_month int;
BEGIN
  SELECT staff_id, type, quarter, program_year, location_id
    INTO v_staff_id, v_type, v_quarter, v_year, v_location_id
  FROM public.evaluations
  WHERE id = p_eval_id;

  IF v_staff_id IS NULL THEN
    RETURN;
  END IF;

  -- Only Quarterly evals get aggregated self-scores
  IF v_type IS DISTINCT FROM 'Quarterly' OR v_quarter IS NULL THEN
    RETURN;
  END IF;

  -- Resolve location timezone (default America/Chicago if missing)
  SELECT COALESCE(timezone, 'America/Chicago') INTO v_tz
  FROM public.locations WHERE id = v_location_id;

  IF v_tz IS NULL THEN
    v_tz := 'America/Chicago';
  END IF;

  -- Compute quarter window in the location's timezone (calendar quarters)
  v_q_start_month := CASE v_quarter
    WHEN 'Q1' THEN 1
    WHEN 'Q2' THEN 4
    WHEN 'Q3' THEN 7
    WHEN 'Q4' THEN 10
  END;

  v_q_start := make_date(v_year, v_q_start_month, 1);
  v_q_end   := (v_q_start + INTERVAL '3 months' - INTERVAL '1 day')::date;

  -- Aggregate weekly performance scores per competency for the staff in window
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
      AND ws.week_of BETWEEN v_q_start AND v_q_end
    GROUP BY ws.competency_id
  )
  UPDATE public.evaluation_items ei
  SET
    self_score_avg = a.avg_score,
    self_score_sample_size = a.n,
    -- Populate integer self_score only when we have sufficient data (n >= 3).
    -- Round to nearest int for back-compat with views/exports.
    self_score = CASE WHEN a.n >= 3 THEN ROUND(a.avg_score)::int ELSE NULL END,
    self_is_na = false,
    self_note = NULL
  FROM agg a
  WHERE ei.evaluation_id = p_eval_id
    AND ei.competency_id = a.competency_id;

  -- For competencies with no weekly data at all, clear stale values
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
        AND ws.week_of BETWEEN v_q_start AND v_q_end
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_eval_self_scores(uuid) TO authenticated;