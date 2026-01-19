-- Drop and recreate with new return columns (role_id, role_name)
DROP FUNCTION IF EXISTS public.get_location_domain_staff_averages(uuid, uuid[], integer[], text[], timestamp with time zone, timestamp with time zone, boolean);

CREATE OR REPLACE FUNCTION public.get_location_domain_staff_averages(
  p_org_id uuid,
  p_location_ids uuid[] DEFAULT NULL::uuid[],
  p_role_ids integer[] DEFAULT NULL::integer[],
  p_types text[] DEFAULT NULL::text[],
  p_start timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_end timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_include_no_eval boolean DEFAULT false
)
RETURNS TABLE(
  location_id uuid,
  location_name text,
  staff_id uuid,
  staff_name text,
  role_id integer,
  role_name text,
  domain_id integer,
  domain_name text,
  n_items integer,
  avg_observer numeric,
  has_eval boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
           COALESCE(l.name, 'Unknown Location') AS location_name,
           COALESCE(r.role_name, 'Unknown Role') AS role_name_val
    FROM staff s
    JOIN locations l ON l.id = s.primary_location_id
    LEFT JOIN roles r ON r.role_id = s.role_id
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
      v.domain_id::int AS domain_id,
      v.domain_name,
      COUNT(*)::int AS n_items,
      ROUND(AVG(v.observer_score)::numeric, 2) AS avg_observer
    FROM evals v
    GROUP BY v.primary_location_id, v.staff_id, v.domain_id, v.domain_name
  )
  SELECT
    s.primary_location_id AS location_id,
    s.location_name,
    s.staff_id,
    s.staff_name,
    s.role_id::int AS role_id,
    s.role_name_val AS role_name,
    a.domain_id,
    COALESCE(a.domain_name, 'Unassigned') AS domain_name,
    COALESCE(a.n_items, 0) AS n_items,
    a.avg_observer,
    (a.n_items IS NOT NULL) AS has_eval
  FROM staff_in_scope s
  LEFT JOIN agg a
    ON a.staff_id = s.staff_id
  WHERE p_include_no_eval OR a.n_items IS NOT NULL
  ORDER BY s.location_name, s.staff_name, a.domain_name NULLS LAST;
END;
$$;