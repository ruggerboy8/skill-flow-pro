-- Drop existing functions first
DROP FUNCTION IF EXISTS compare_conf_perf_to_eval(uuid,integer,uuid[],integer[],text[],timestamp with time zone,timestamp with time zone);
DROP FUNCTION IF EXISTS get_strengths_weaknesses(uuid,uuid[],integer[],text[],timestamp with time zone,timestamp with time zone);

-- Recreate get_strengths_weaknesses function with fixed UNION
CREATE OR REPLACE FUNCTION get_strengths_weaknesses(
  p_org_id        uuid,
  p_location_ids  uuid[] DEFAULT NULL,
  p_role_ids      int[]  DEFAULT NULL,
  p_types         text[] DEFAULT NULL,
  p_start         timestamptz DEFAULT NULL,
  p_end           timestamptz DEFAULT NULL
) RETURNS TABLE (
  level text,
  id    int,
  name  text,
  n_items int,
  avg_observer numeric
) 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Superadmin security check
  IF NOT EXISTS (
    SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT *
    FROM view_evaluation_items_enriched v
    WHERE v.organization_id = p_org_id
      AND (p_location_ids IS NULL OR v.primary_location_id = ANY(p_location_ids))
      AND (p_role_ids     IS NULL OR v.role_id            = ANY(p_role_ids))
      AND (p_types        IS NULL OR v.evaluation_type    = ANY(p_types))
      AND (p_start IS NULL OR v.evaluation_at >= p_start)
      AND (p_end   IS NULL OR v.evaluation_at <  p_end)
      AND v.observer_score IS NOT NULL
  ),
  domain_results AS (
    SELECT 'domain'::text as level, b.domain_id as id, b.domain_name as name, 
           COUNT(*)::int as n_items, ROUND(AVG(b.observer_score)::numeric, 2) as avg_observer
    FROM base b
    WHERE b.domain_id IS NOT NULL
    GROUP BY b.domain_id, b.domain_name
  ),
  competency_results AS (
    SELECT 'competency'::text as level, b.competency_id as id, c.name as name,
           COUNT(*)::int as n_items, ROUND(AVG(b.observer_score)::numeric, 2) as avg_observer
    FROM base b
    LEFT JOIN competencies c ON c.competency_id = b.competency_id
    WHERE b.competency_id IS NOT NULL
    GROUP BY b.competency_id, c.name
  )
  SELECT dr.level, dr.id, dr.name, dr.n_items, dr.avg_observer FROM domain_results dr
  UNION ALL
  SELECT cr.level, cr.id, cr.name, cr.n_items, cr.avg_observer FROM competency_results cr
  ORDER BY level, avg_observer DESC;
END;
$$;

-- Recreate compare_conf_perf_to_eval function with competency name
CREATE OR REPLACE FUNCTION compare_conf_perf_to_eval(
  p_org_id        uuid,
  p_window_days   int   DEFAULT 42,
  p_location_ids  uuid[] DEFAULT NULL,
  p_role_ids      int[]  DEFAULT NULL,
  p_types         text[] DEFAULT NULL,
  p_start         timestamptz DEFAULT NULL,
  p_end           timestamptz DEFAULT NULL
) RETURNS TABLE (
  evaluation_id uuid,
  staff_id uuid,
  primary_location_id uuid,
  competency_id int,
  competency_name text,
  domain_id int,
  domain_name text,
  eval_observer_avg numeric,
  eval_self_avg numeric,
  conf_avg numeric,
  perf_avg numeric
) 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Superadmin security check
  IF NOT EXISTS (
    SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH evals AS (
    SELECT v.*, c.name as competency_name
    FROM view_evaluation_items_enriched v
    LEFT JOIN competencies c ON c.competency_id = v.competency_id
    WHERE v.organization_id = p_org_id
      AND (p_location_ids IS NULL OR v.primary_location_id = ANY(p_location_ids))
      AND (p_role_ids     IS NULL OR v.role_id            = ANY(p_role_ids))
      AND (p_types        IS NULL OR v.evaluation_type    = ANY(p_types))
      AND (p_start IS NULL OR v.evaluation_at >= p_start)
      AND (p_end   IS NULL OR v.evaluation_at <  p_end)
      AND v.competency_id IS NOT NULL -- Only include rows with competency
  ),
  ws_window AS (
    SELECT
      e.evaluation_id,
      w.staff_id,
      w.competency_id,
      w.domain_id,
      w.domain_name,
      ROUND(AVG(w.confidence_score) FILTER (WHERE w.confidence_score IS NOT NULL)::numeric, 2) AS conf_avg,
      ROUND(AVG(w.performance_score) FILTER (WHERE w.performance_score IS NOT NULL)::numeric, 2) AS perf_avg
    FROM evals e
    JOIN view_weekly_scores_with_competency w
      ON w.staff_id = e.staff_id
     AND w.competency_id = e.competency_id
     AND w.organization_id = p_org_id
     AND w.created_at >= (e.evaluation_at - MAKE_INTERVAL(days => p_window_days))
     AND w.created_at <   e.evaluation_at
    GROUP BY e.evaluation_id, w.staff_id, w.competency_id, w.domain_id, w.domain_name
  )
  SELECT
    e.evaluation_id,
    e.staff_id,
    e.primary_location_id,
    e.competency_id,
    e.competency_name,
    e.domain_id,
    e.domain_name,
    ROUND(AVG(e.observer_score)::numeric, 2) AS eval_observer_avg,
    ROUND(AVG(e.self_score)::numeric, 2) AS eval_self_avg,
    w.conf_avg,
    w.perf_avg
  FROM evals e
  LEFT JOIN ws_window w
    ON w.evaluation_id = e.evaluation_id
   AND w.competency_id = e.competency_id
  GROUP BY e.evaluation_id, e.staff_id, e.primary_location_id,
           e.competency_id, e.competency_name, e.domain_id, e.domain_name, w.conf_avg, w.perf_avg;
END;
$$;