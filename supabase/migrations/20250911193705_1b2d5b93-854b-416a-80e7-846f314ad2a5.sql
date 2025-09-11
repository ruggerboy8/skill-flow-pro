-- Drop and recreate compare_conf_perf_to_eval to add framework column

DROP FUNCTION IF EXISTS public.compare_conf_perf_to_eval(uuid, integer, uuid[], integer[], text[], timestamp with time zone, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.compare_conf_perf_to_eval(
  p_org_id uuid, 
  p_window_days integer DEFAULT 42, 
  p_location_ids uuid[] DEFAULT NULL::uuid[], 
  p_role_ids integer[] DEFAULT NULL::integer[], 
  p_types text[] DEFAULT NULL::text[], 
  p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, 
  p_end timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS TABLE(
  evaluation_id uuid, 
  staff_id uuid, 
  primary_location_id uuid, 
  competency_id bigint, 
  competency_name text, 
  domain_id bigint, 
  domain_name text, 
  eval_observer_avg numeric, 
  eval_self_avg numeric, 
  conf_avg numeric, 
  perf_avg numeric,
  framework text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Superadmin security check
  IF NOT EXISTS (
    SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH evals AS (
    SELECT v.*, c.name as competency_name,
           CASE 
             WHEN c.code LIKE 'DFI.%' THEN 'DFI'
             WHEN c.code LIKE 'RDA.%' THEN 'RDA'
             ELSE NULL
           END as framework
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
    w.perf_avg,
    e.framework
  FROM evals e
  LEFT JOIN ws_window w
    ON w.evaluation_id = e.evaluation_id
   AND w.competency_id = e.competency_id
  GROUP BY e.evaluation_id, e.staff_id, e.primary_location_id,
           e.competency_id, e.competency_name, e.domain_id, e.domain_name, w.conf_avg, w.perf_avg, e.framework
  ORDER BY e.domain_id, e.competency_name;
END;
$function$