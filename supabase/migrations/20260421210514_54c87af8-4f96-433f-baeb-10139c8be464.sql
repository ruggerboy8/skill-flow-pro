-- 1) Lower self-score threshold from n>=3 to n>=2 in compute_eval_self_scores
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

  IF v_type IS DISTINCT FROM 'Quarterly' OR v_quarter IS NULL THEN
    RETURN;
  END IF;

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
    self_score = CASE WHEN a.n >= 2 THEN ROUND(a.avg_score)::int ELSE NULL END,
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

-- 2) Add participation_snapshot column to evaluations
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS participation_snapshot jsonb;

-- 3) Function to compute participation snapshot
CREATE OR REPLACE FUNCTION public.compute_eval_participation_snapshot(p_eval_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id uuid;
  v_type text;
  v_created_at timestamptz;
  v_window_end date;
  v_window_start date;
  v_snapshot jsonb;
  v_conf_completed int := 0;
  v_perf_completed int := 0;
  v_on_time_count int := 0;
  v_weeks_in_window int := 12;
  v_total_self int := 0;
  v_competencies_with_data int := 0;
BEGIN
  SELECT staff_id, type, created_at
    INTO v_staff_id, v_type, v_created_at
  FROM public.evaluations
  WHERE id = p_eval_id;

  IF v_staff_id IS NULL THEN
    RETURN;
  END IF;

  -- Skip baselines entirely (no participation history)
  IF v_type = 'Baseline' THEN
    UPDATE public.evaluations SET participation_snapshot = NULL WHERE id = p_eval_id;
    RETURN;
  END IF;

  v_window_end := v_created_at::date;
  v_window_start := v_window_end - INTERVAL '12 weeks';

  -- Group by week_of, count completed conf + perf weeks (and on-time)
  WITH windows AS (
    SELECT
      week_of,
      metric,
      status,
      on_time,
      due_at
    FROM public.view_staff_submission_windows
    WHERE staff_id = v_staff_id
      AND week_of BETWEEN v_window_start AND v_window_end
      AND (due_at <= now() OR status = 'submitted')
  ),
  per_week AS (
    SELECT
      week_of,
      bool_or(metric = 'confidence' AND status = 'submitted') AS conf_done,
      bool_or(metric = 'confidence' AND status = 'submitted' AND on_time = true) AS conf_on_time,
      bool_or(metric = 'confidence') AS conf_exists,
      bool_or(metric = 'performance' AND status = 'submitted') AS perf_done,
      bool_or(metric = 'performance' AND status = 'submitted' AND on_time = true) AS perf_on_time,
      bool_or(metric = 'performance') AS perf_exists
    FROM windows
    GROUP BY week_of
  )
  SELECT
    COALESCE(SUM(CASE WHEN conf_done THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(CASE WHEN perf_done THEN 1 ELSE 0 END), 0)::int,
    COALESCE(SUM(
      (CASE WHEN conf_on_time THEN 1 ELSE 0 END) +
      (CASE WHEN perf_on_time THEN 1 ELSE 0 END)
    ), 0)::int
  INTO v_conf_completed, v_perf_completed, v_on_time_count
  FROM per_week;

  -- Aggregate self-score sample sizes from evaluation_items
  SELECT
    COALESCE(SUM(self_score_sample_size), 0)::int,
    COALESCE(COUNT(*) FILTER (WHERE self_score_sample_size >= 2), 0)::int
  INTO v_total_self, v_competencies_with_data
  FROM public.evaluation_items
  WHERE evaluation_id = p_eval_id;

  v_snapshot := jsonb_build_object(
    'window_start', v_window_start,
    'window_end', v_window_end,
    'weeks_in_window', v_weeks_in_window,
    'confidence_completed', v_conf_completed,
    'performance_completed', v_perf_completed,
    'on_time_count', v_on_time_count,
    'total_self_score_submissions', v_total_self,
    'competencies_with_data', v_competencies_with_data
  );

  UPDATE public.evaluations
  SET participation_snapshot = v_snapshot
  WHERE id = p_eval_id;
END;
$$;

-- 4) Recompute Taylor's eval (self scores at new threshold + snapshot)
SELECT public.compute_eval_self_scores('406a4910-609a-446f-8e03-3d657588aab0'::uuid);
SELECT public.compute_eval_participation_snapshot('406a4910-609a-446f-8e03-3d657588aab0'::uuid);