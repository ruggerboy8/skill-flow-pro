-- Fix column name: staff.primary_location_id not location_id
DROP FUNCTION IF EXISTS public.get_location_domain_staff_averages;

CREATE OR REPLACE FUNCTION public.get_location_domain_staff_averages(
  p_org_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_include_no_eval boolean DEFAULT false,
  p_location_ids uuid[] DEFAULT NULL,
  p_role_ids integer[] DEFAULT NULL,
  p_types text[] DEFAULT NULL
)
RETURNS TABLE (
  location_id uuid,
  location_name text,
  staff_id uuid,
  staff_name text,
  role_id integer,
  role_name text,
  domain_id integer,
  domain_name text,
  n_items bigint,
  avg_observer numeric,
  avg_self numeric,
  eval_status text,
  has_eval boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH eval_items AS (
    SELECT
      e.id AS eval_id,
      e.staff_id,
      e.status AS eval_status,
      ei.domain_id,
      ei.observer_score,
      ei.self_score
    FROM evaluations e
    JOIN evaluation_items ei ON ei.evaluation_id = e.id
    WHERE e.created_at >= p_start
      AND e.created_at <= p_end
      AND (p_types IS NULL OR e.type = ANY(p_types))
  ),
  staff_domain_agg AS (
    SELECT
      s.id AS staff_id,
      s.name AS staff_name,
      s.role_id,
      r.role_name AS role_name,
      s.primary_location_id AS location_id,
      l.name AS location_name,
      d.domain_id AS domain_id,
      d.domain_name AS domain_name,
      COUNT(ei.observer_score) AS n_items,
      ROUND(AVG(ei.observer_score)::numeric, 2) AS avg_observer,
      ROUND(AVG(ei.self_score)::numeric, 2) AS avg_self,
      ei.eval_status,
      CASE WHEN COUNT(ei.observer_score) > 0 THEN true ELSE false END AS has_eval
    FROM staff s
    JOIN locations l ON l.id = s.primary_location_id
    JOIN roles r ON r.role_id = s.role_id
    CROSS JOIN domains d
    LEFT JOIN eval_items ei ON ei.staff_id = s.id AND ei.domain_id = d.domain_id
    WHERE l.organization_id = p_org_id
      AND s.is_participant = true
      AND (p_location_ids IS NULL OR s.primary_location_id = ANY(p_location_ids))
      AND (p_role_ids IS NULL OR s.role_id = ANY(p_role_ids))
    GROUP BY s.id, s.name, s.role_id, r.role_name, s.primary_location_id, l.name, d.domain_id, d.domain_name, ei.eval_status
  )
  SELECT
    sda.location_id,
    sda.location_name,
    sda.staff_id,
    sda.staff_name,
    sda.role_id::integer,
    sda.role_name,
    sda.domain_id::integer,
    sda.domain_name,
    sda.n_items,
    sda.avg_observer,
    sda.avg_self,
    sda.eval_status,
    sda.has_eval
  FROM staff_domain_agg sda
  WHERE p_include_no_eval = true OR sda.has_eval = true
  ORDER BY sda.location_name, sda.staff_name, sda.domain_name;
END;
$$;