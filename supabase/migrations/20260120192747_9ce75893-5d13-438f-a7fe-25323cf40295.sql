-- Create RPC for distribution-based evaluation metrics
-- Returns counts for top-box (4), bottom-box (1-2), and mismatch (obs != self)

CREATE OR REPLACE FUNCTION public.get_eval_distribution_metrics(
  p_org_id uuid,
  p_types text[],
  p_program_year int,
  p_quarter text DEFAULT NULL,
  p_location_ids uuid[] DEFAULT NULL,
  p_role_ids int[] DEFAULT NULL
)
RETURNS TABLE (
  location_id uuid,
  location_name text,
  domain_id int,
  domain_name text,
  role_id int,
  role_name text,
  staff_id uuid,
  staff_name text,
  evaluation_id uuid,
  evaluation_status text,
  
  -- Distribution counts (from evaluation_items)
  n_items int,
  obs_top_box int,      -- count of observer_score = 4
  obs_bottom_box int,   -- count of observer_score IN (1, 2)
  self_top_box int,     -- count of self_score = 4
  self_bottom_box int,  -- count of self_score IN (1, 2)
  
  -- Mismatch: count where observer_score != self_score (both must be non-null)
  mismatch_count int,
  
  -- Means (secondary, for display)
  obs_mean numeric(3,1),
  self_mean numeric(3,1)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_evals AS (
    SELECT 
      e.id as eval_id,
      e.staff_id,
      e.status as eval_status,
      s.name as staff_name,
      s.role_id,
      r.name as role_name,
      l.id as loc_id,
      l.name as loc_name
    FROM evaluations e
    JOIN staff s ON s.id = e.staff_id
    JOIN roles r ON r.id = s.role_id
    JOIN locations l ON l.id = s.location_id
    WHERE l.org_id = p_org_id
      AND e.program_year = p_program_year
      AND e.type = ANY(p_types)
      AND (p_quarter IS NULL OR e.quarter = p_quarter)
      AND (p_location_ids IS NULL OR l.id = ANY(p_location_ids))
      AND (p_role_ids IS NULL OR s.role_id = ANY(p_role_ids))
  ),
  item_metrics AS (
    SELECT
      fe.loc_id,
      fe.loc_name,
      fe.staff_id,
      fe.staff_name,
      fe.role_id,
      fe.role_name,
      fe.eval_id,
      fe.eval_status,
      c.domain_id,
      d.name as dom_name,
      
      -- Counts
      COUNT(*)::int as n,
      COUNT(*) FILTER (WHERE ei.observer_score = 4)::int as obs_top,
      COUNT(*) FILTER (WHERE ei.observer_score IN (1, 2))::int as obs_bottom,
      COUNT(*) FILTER (WHERE ei.self_score = 4)::int as self_top,
      COUNT(*) FILTER (WHERE ei.self_score IN (1, 2))::int as self_bottom,
      COUNT(*) FILTER (WHERE ei.observer_score IS NOT NULL 
                        AND ei.self_score IS NOT NULL 
                        AND ei.observer_score != ei.self_score)::int as mismatch,
      
      -- Means
      ROUND(AVG(ei.observer_score)::numeric, 1) as obs_avg,
      ROUND(AVG(ei.self_score)::numeric, 1) as self_avg
    FROM filtered_evals fe
    JOIN evaluation_items ei ON ei.evaluation_id = fe.eval_id
    JOIN competencies c ON c.id = ei.competency_id
    JOIN domains d ON d.id = c.domain_id
    WHERE ei.observer_score IS NOT NULL OR ei.self_score IS NOT NULL
    GROUP BY 
      fe.loc_id, fe.loc_name, fe.staff_id, fe.staff_name, 
      fe.role_id, fe.role_name, fe.eval_id, fe.eval_status,
      c.domain_id, d.name
  )
  SELECT 
    im.loc_id as location_id,
    im.loc_name as location_name,
    im.domain_id::int,
    im.dom_name as domain_name,
    im.role_id::int,
    im.role_name,
    im.staff_id,
    im.staff_name,
    im.eval_id as evaluation_id,
    im.eval_status as evaluation_status,
    im.n as n_items,
    im.obs_top as obs_top_box,
    im.obs_bottom as obs_bottom_box,
    im.self_top as self_top_box,
    im.self_bottom as self_bottom_box,
    im.mismatch as mismatch_count,
    im.obs_avg as obs_mean,
    im.self_avg as self_mean
  FROM item_metrics im
  ORDER BY im.loc_name, im.staff_name, im.dom_name;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_eval_distribution_metrics TO authenticated;