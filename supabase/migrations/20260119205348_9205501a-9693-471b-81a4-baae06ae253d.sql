-- Drop all three functions first
DROP FUNCTION IF EXISTS public.get_staff_domain_avgs(uuid, timestamptz, timestamptz, uuid[], int[], text[], boolean);
DROP FUNCTION IF EXISTS public.get_location_domain_staff_averages(uuid, uuid[], int[], text[], timestamptz, timestamptz, boolean);

-- Recreate get_staff_domain_avgs to exclude regional managers
CREATE FUNCTION public.get_staff_domain_avgs(
  p_org_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_location_ids uuid[] DEFAULT NULL,
  p_role_ids int[] DEFAULT NULL,
  p_eval_types text[] DEFAULT NULL,
  p_include_no_eval boolean DEFAULT false
)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  role_id int,
  location_id uuid,
  location_name text,
  domain_id int,
  domain_name text,
  observer_avg numeric,
  self_avg numeric,
  n_items int,
  last_eval_at timestamptz,
  has_eval boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Superadmin security check
  IF NOT EXISTS (
    SELECT 1 FROM staff s WHERE s.user_id = auth.uid() AND s.is_super_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH base_staff AS (
    SELECT 
      s.id as staff_id, 
      s.name as staff_name, 
      s.role_id, 
      s.primary_location_id as location_id
    FROM staff s
    JOIN locations l ON l.id = s.primary_location_id
    WHERE l.organization_id = p_org_id
      AND s.is_org_admin = false  -- Exclude regional managers
      AND (p_location_ids IS NULL OR array_length(p_location_ids, 1) IS NULL OR s.primary_location_id = ANY(p_location_ids))
      AND (p_role_ids IS NULL OR array_length(p_role_ids, 1) IS NULL OR s.role_id = ANY(p_role_ids))
  ),
  evals_in_range AS (
    SELECT e.id as evaluation_id, e.staff_id, e.updated_at as evaluated_at, e.type
    FROM evaluations e
    WHERE e.updated_at >= p_start AND e.updated_at < p_end
      AND (p_eval_types IS NULL OR array_length(p_eval_types, 1) IS NULL OR e.type = ANY(p_eval_types))
      AND e.status = 'submitted'
  ),
  items AS (
    SELECT
      e.staff_id,
      d.domain_id,
      d.domain_name,
      i.observer_score,
      i.self_score,
      e.evaluated_at
    FROM evaluation_items i
    JOIN evals_in_range e ON e.evaluation_id = i.evaluation_id
    LEFT JOIN competencies c ON c.competency_id = i.competency_id
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    WHERE d.domain_id IS NOT NULL
  ),
  agg AS (
    SELECT
      i.staff_id,
      i.domain_id,
      i.domain_name,
      ROUND(AVG(i.observer_score)::numeric, 1) as observer_avg,
      ROUND(AVG(i.self_score)::numeric, 1) as self_avg,
      COUNT(*)::int as n_items,
      MAX(i.evaluated_at) as last_eval_at
    FROM items i
    GROUP BY i.staff_id, i.domain_id, i.domain_name
  )
  SELECT
    bs.staff_id,
    bs.staff_name,
    bs.role_id,
    bs.location_id,
    l.name as location_name,
    a.domain_id,
    a.domain_name,
    a.observer_avg,
    a.self_avg,
    a.n_items,
    a.last_eval_at,
    (a.staff_id IS NOT NULL) as has_eval
  FROM base_staff bs
  JOIN locations l ON l.id = bs.location_id
  LEFT JOIN agg a ON a.staff_id = bs.staff_id
  WHERE p_include_no_eval IS TRUE OR a.staff_id IS NOT NULL
  ORDER BY l.name, bs.staff_name, a.domain_name NULLS LAST;
END;
$$;

-- Recreate get_location_domain_staff_averages to exclude regional managers
CREATE FUNCTION public.get_location_domain_staff_averages(
  p_org_id uuid,
  p_location_ids uuid[] DEFAULT NULL,
  p_role_ids int[] DEFAULT NULL,
  p_types text[] DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_include_no_eval boolean DEFAULT false
)
RETURNS TABLE (
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
SET search_path = public
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
      AND s.is_org_admin = false  -- Exclude regional managers
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