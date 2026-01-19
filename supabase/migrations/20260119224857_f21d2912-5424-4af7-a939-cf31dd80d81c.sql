-- Update get_location_domain_staff_averages to include avg_self and eval_status
CREATE OR REPLACE FUNCTION public.get_location_domain_staff_averages(
  p_org_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_include_no_eval boolean DEFAULT true,
  p_location_ids uuid[] DEFAULT NULL,
  p_role_ids integer[] DEFAULT NULL,
  p_types text[] DEFAULT ARRAY['Quarterly']
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
  n_items integer,
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
  WITH base_staff AS (
    SELECT
      s.user_id,
      s.first_name || ' ' || s.last_name AS staff_name_val,
      s.location_id AS loc_id,
      l.name AS loc_name,
      s.role_id AS staff_role_id,
      r.role_name AS role_name_val
    FROM staff s
    JOIN locations l ON l.id = s.location_id
    LEFT JOIN roles r ON r.role_id = s.role_id
    WHERE l.organization_id = p_org_id
      AND s.active = true
      AND (p_location_ids IS NULL OR s.location_id = ANY(p_location_ids))
      AND (p_role_ids IS NULL OR s.role_id = ANY(p_role_ids))
  ),
  eval_data AS (
    SELECT
      e.staff_id,
      e.id AS eval_id,
      e.status AS eval_status_val,
      ei.domain_id AS item_domain_id,
      COALESCE(ei.domain_name, d.domain_name) AS item_domain_name,
      ei.observer_score,
      ei.self_score
    FROM evaluations e
    JOIN evaluation_items ei ON ei.evaluation_id = e.id
    LEFT JOIN domains d ON d.domain_id = ei.domain_id
    WHERE e.type = ANY(p_types)
      AND e.created_at >= p_start
      AND e.created_at <= p_end
  ),
  agg AS (
    SELECT
      bs.user_id,
      bs.staff_name_val,
      bs.loc_id,
      bs.loc_name,
      bs.staff_role_id,
      bs.role_name_val,
      ed.item_domain_id,
      ed.item_domain_name,
      ed.eval_status_val,
      COUNT(ed.observer_score)::int AS n_items,
      ROUND(AVG(ed.observer_score)::numeric, 2) AS avg_obs,
      ROUND(AVG(ed.self_score)::numeric, 2) AS avg_self_score,
      CASE WHEN COUNT(ed.observer_score) > 0 THEN true ELSE false END AS has_eval_flag
    FROM base_staff bs
    LEFT JOIN eval_data ed ON ed.staff_id = bs.user_id
    GROUP BY bs.user_id, bs.staff_name_val, bs.loc_id, bs.loc_name, 
             bs.staff_role_id, bs.role_name_val, ed.item_domain_id, ed.item_domain_name, ed.eval_status_val
  )
  SELECT
    agg.loc_id,
    agg.loc_name,
    agg.user_id,
    agg.staff_name_val,
    agg.staff_role_id::int,
    agg.role_name_val,
    agg.item_domain_id,
    agg.item_domain_name,
    agg.n_items,
    agg.avg_obs,
    agg.avg_self_score,
    agg.eval_status_val,
    agg.has_eval_flag
  FROM agg
  WHERE p_include_no_eval = true OR agg.has_eval_flag = true
  ORDER BY agg.loc_name, agg.staff_name_val, agg.item_domain_name;
END;
$$;