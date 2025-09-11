-- Drop and recreate functions to add framework column

DROP FUNCTION IF EXISTS public.get_strengths_weaknesses(uuid, uuid[], integer[], text[], timestamp with time zone, timestamp with time zone);

CREATE OR REPLACE FUNCTION public.get_strengths_weaknesses(
  p_org_id uuid, 
  p_location_ids uuid[] DEFAULT NULL::uuid[], 
  p_role_ids integer[] DEFAULT NULL::integer[], 
  p_types text[] DEFAULT NULL::text[], 
  p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, 
  p_end timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS TABLE(
  level text, 
  id bigint, 
  name text, 
  n_items integer, 
  avg_observer numeric, 
  domain_id bigint, 
  domain_name text,
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
    SELECT 
      'domain'::text as level, 
      b.domain_id as id, 
      b.domain_name as name, 
      COUNT(*)::int as n_items, 
      ROUND(AVG(b.observer_score)::numeric, 2) as avg_observer,
      b.domain_id as domain_id,
      b.domain_name as domain_name,
      NULL::text as framework
    FROM base b
    WHERE b.domain_id IS NOT NULL
    GROUP BY b.domain_id, b.domain_name
  ),
  competency_results AS (
    SELECT 
      'competency'::text as level, 
      b.competency_id as id, 
      c.name as name,
      COUNT(*)::int as n_items, 
      ROUND(AVG(b.observer_score)::numeric, 2) as avg_observer,
      b.domain_id as domain_id,
      b.domain_name as domain_name,
      CASE 
        WHEN c.code LIKE 'DFI.%' THEN 'DFI'
        WHEN c.code LIKE 'RDA.%' THEN 'RDA'
        ELSE NULL
      END as framework
    FROM base b
    LEFT JOIN competencies c ON c.competency_id = b.competency_id
    WHERE b.competency_id IS NOT NULL
    GROUP BY b.competency_id, c.name, b.domain_id, b.domain_name, c.code
  )
  SELECT dr.level, dr.id, dr.name, dr.n_items, dr.avg_observer, dr.domain_id, dr.domain_name, dr.framework FROM domain_results dr
  UNION ALL
  SELECT cr.level, cr.id, cr.name, cr.n_items, cr.avg_observer, cr.domain_id, cr.domain_name, cr.framework FROM competency_results cr
  ORDER BY domain_id, level, avg_observer DESC;
END;
$function$