-- Drop existing function and recreate with correct column names
DROP FUNCTION IF EXISTS get_eval_distribution_metrics(uuid, text[], int, text, uuid[], int[]);

CREATE OR REPLACE FUNCTION get_eval_distribution_metrics(
  p_org_id uuid,
  p_types text[],
  p_program_year int,
  p_quarter text DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_role_ids int[] DEFAULT NULL
) RETURNS TABLE (
  location_id uuid,
  location_name text,
  domain_id bigint,
  domain_name text,
  role_id int,
  role_name text,
  staff_id uuid,
  staff_name text,
  evaluation_id uuid,
  evaluation_status text,
  n_items int,
  obs_top_box int,
  obs_bottom_box int,
  self_top_box int,
  self_bottom_box int,
  mismatch_count int,
  obs_mean numeric(3,1),
  self_mean numeric(3,1)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.location_id::uuid,
    l.name::text AS location_name,
    ei.domain_id::bigint,
    ei.domain_name::text,
    r.role_id::int,
    r.role_name::text,
    e.staff_id::uuid,
    s.name::text AS staff_name,
    e.id::uuid AS evaluation_id,
    e.status::text AS evaluation_status,
    COUNT(*)::int AS n_items,
    COUNT(*) FILTER (WHERE ei.observer_score = 4)::int AS obs_top_box,
    COUNT(*) FILTER (WHERE ei.observer_score IN (1, 2))::int AS obs_bottom_box,
    COUNT(*) FILTER (WHERE ei.self_score = 4)::int AS self_top_box,
    COUNT(*) FILTER (WHERE ei.self_score IN (1, 2))::int AS self_bottom_box,
    COUNT(*) FILTER (WHERE ei.observer_score IS DISTINCT FROM ei.self_score)::int AS mismatch_count,
    ROUND(AVG(ei.observer_score), 1)::numeric(3,1) AS obs_mean,
    ROUND(AVG(ei.self_score), 1)::numeric(3,1) AS self_mean
  FROM evaluation_items ei
  JOIN evaluations e ON e.id = ei.evaluation_id
  JOIN staff s ON s.id = e.staff_id
  JOIN locations l ON l.id = e.location_id
  JOIN roles r ON r.role_id = s.role_id
  WHERE l.organization_id = p_org_id
    AND e.type = ANY(p_types)
    AND e.program_year = p_program_year
    AND (p_quarter IS NULL OR e.quarter = p_quarter)
    AND (p_location_ids IS NULL OR e.location_id = ANY(p_location_ids))
    AND (p_role_ids IS NULL OR s.role_id = ANY(p_role_ids))
  GROUP BY
    e.location_id,
    l.name,
    ei.domain_id,
    ei.domain_name,
    r.role_id,
    r.role_name,
    e.staff_id,
    s.name,
    e.id,
    e.status;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;