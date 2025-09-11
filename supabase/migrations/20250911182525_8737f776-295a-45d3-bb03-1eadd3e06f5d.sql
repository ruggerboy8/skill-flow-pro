-- First, add necessary indexes for performance
CREATE INDEX IF NOT EXISTS idx_evaluations_staff_created_type ON evaluations (staff_id, created_at, type);
CREATE INDEX IF NOT EXISTS idx_weekly_scores_staff_created ON weekly_scores (staff_id, created_at);
CREATE INDEX IF NOT EXISTS idx_weekly_focus_id_role_cycle_week ON weekly_focus (id, role_id, cycle, week_in_cycle);
CREATE INDEX IF NOT EXISTS idx_pro_moves_action_competency ON pro_moves (action_id, competency_id);
CREATE INDEX IF NOT EXISTS idx_competencies_id_domain ON competencies (competency_id, domain_id);
CREATE INDEX IF NOT EXISTS idx_locations_id_organization ON locations (id, organization_id);
CREATE INDEX IF NOT EXISTS idx_staff_id_role_location ON staff (id, role_id, primary_location_id);

-- Create enriched view for evaluation items with organization data
CREATE OR REPLACE VIEW view_evaluation_items_enriched AS
SELECT
  e.id                       AS evaluation_id,
  e.type                     AS evaluation_type,
  e.quarter,
  e.program_year,
  e.created_at               AS evaluation_at,

  subj.id                    AS staff_id,
  subj.name                  AS staff_name,
  subj.role_id,
  subj.primary_location_id,
  COALESCE(loc.name, 'Unknown Location') AS location_name,
  loc.organization_id,       -- NEW

  ei.competency_id,
  c.domain_id,
  COALESCE(d.domain_name, 'Unassigned') AS domain_name,

  ei.observer_score,
  ei.self_score
FROM evaluation_items ei
JOIN evaluations e      ON e.id = ei.evaluation_id
JOIN staff subj         ON subj.id = e.staff_id
LEFT JOIN locations loc ON loc.id = subj.primary_location_id
LEFT JOIN competencies c ON c.competency_id = ei.competency_id
LEFT JOIN domains d      ON d.domain_id = c.domain_id;
-- TODO: This uses current primary_location_id, may mis-attribute historical evals if staff moved

-- Create weekly scores view with competency data
CREATE OR REPLACE VIEW view_weekly_scores_with_competency AS
SELECT
  ws.id                         AS weekly_score_id,
  ws.staff_id,
  s.role_id,
  s.primary_location_id,
  loc.organization_id,          -- helpful filter
  ws.weekly_focus_id,
  COALESCE(ws.selected_action_id, wf.action_id) AS action_id,
  pm.competency_id,
  c.domain_id,
  COALESCE(d.domain_name, 'Unassigned') AS domain_name,
  ws.confidence_score,
  ws.performance_score,
  ws.created_at
FROM weekly_scores ws
JOIN staff s          ON s.id = ws.staff_id
LEFT JOIN locations loc ON loc.id = s.primary_location_id
JOIN weekly_focus wf  ON wf.id = ws.weekly_focus_id
LEFT JOIN pro_moves pm ON pm.action_id = COALESCE(ws.selected_action_id, wf.action_id)
LEFT JOIN competencies c ON c.competency_id = pm.competency_id
LEFT JOIN domains d      ON d.domain_id = c.domain_id
WHERE pm.competency_id IS NOT NULL; -- Filter out self-select or backlog without competency

-- Function to get strengths and weaknesses
CREATE OR REPLACE FUNCTION get_strengths_weaknesses(
  p_org_id        uuid,
  p_location_ids  uuid[] DEFAULT NULL,
  p_role_ids      int[]  DEFAULT NULL,
  p_types         text[] DEFAULT NULL,
  p_start         timestamptz DEFAULT NULL,
  p_end           timestamptz DEFAULT NULL
) RETURNS TABLE (
  level text,  -- 'domain' or 'competency'
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
  )
  SELECT 'domain'::text, b.domain_id, b.domain_name, COUNT(*)::int, ROUND(AVG(b.observer_score)::numeric, 2)
  FROM base b
  WHERE b.domain_id IS NOT NULL
  GROUP BY b.domain_id, b.domain_name
  UNION ALL
  SELECT 'competency'::text, b.competency_id, c.name, COUNT(*)::int, ROUND(AVG(b.observer_score)::numeric, 2)
  FROM base b
  LEFT JOIN competencies c ON c.competency_id = b.competency_id
  WHERE b.competency_id IS NOT NULL
  GROUP BY b.competency_id, c.name
  ORDER BY level, avg_observer DESC;
END;
$$;

-- Function to compare confidence/performance to evaluations
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
    SELECT *
    FROM view_evaluation_items_enriched v
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
           e.competency_id, e.domain_id, e.domain_name, w.conf_avg, w.perf_avg;
END;
$$;

-- Function to get staff presence and domain averages
CREATE OR REPLACE FUNCTION get_location_domain_staff_averages(
  p_org_id        uuid,
  p_location_ids  uuid[] DEFAULT NULL,
  p_role_ids      int[]  DEFAULT NULL,
  p_types         text[] DEFAULT NULL,
  p_start         timestamptz DEFAULT NULL,
  p_end           timestamptz DEFAULT NULL,
  p_include_no_eval boolean DEFAULT true
) RETURNS TABLE (
  location_id uuid,
  location_name text,
  staff_id uuid,
  staff_name text,
  domain_id int,
  domain_name text,
  n_items int,
  avg_observer numeric,
  has_eval boolean
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
  WITH staff_in_scope AS (
    SELECT s.id AS staff_id, s.name AS staff_name, s.role_id, s.primary_location_id,
           COALESCE(l.name, 'Unknown Location') AS location_name
    FROM staff s
    JOIN locations l ON l.id = s.primary_location_id
    WHERE l.organization_id = p_org_id
      AND (p_location_ids IS NULL OR s.primary_location_id = ANY(p_location_ids))
      AND (p_role_ids     IS NULL OR s.role_id            = ANY(p_role_ids))
  ),
  evals AS (
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
  agg AS (
    SELECT
      v.primary_location_id AS location_id,
      v.staff_id,
      v.domain_id,
      v.domain_name,
      COUNT(*) AS n_items,
      ROUND(AVG(v.observer_score)::numeric, 2) AS avg_observer
    FROM evals v
    GROUP BY v.primary_location_id, v.staff_id, v.domain_id, v.domain_name
  )
  SELECT
    s.primary_location_id AS location_id,
    s.location_name,
    s.staff_id,
    s.staff_name,
    a.domain_id,
    COALESCE(a.domain_name, 'Unassigned') AS domain_name,
    COALESCE(a.n_items, 0)::int AS n_items,
    a.avg_observer,
    (a.n_items IS NOT NULL) AS has_eval
  FROM staff_in_scope s
  LEFT JOIN agg a
    ON a.staff_id = s.staff_id
  WHERE p_include_no_eval OR a.n_items IS NOT NULL
  ORDER BY s.location_name, s.staff_name, a.domain_name NULLS LAST;
END;
$$;