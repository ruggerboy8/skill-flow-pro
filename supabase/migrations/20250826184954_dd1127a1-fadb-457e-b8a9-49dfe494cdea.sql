-- Update get_evaluations_summary to filter submitted evaluations only
CREATE OR REPLACE FUNCTION public.get_evaluations_summary(p_staff_id uuid, p_only_submitted boolean DEFAULT true)
 RETURNS TABLE(eval_id uuid, submitted_at timestamp with time zone, status text, type text, quarter text, program_year integer, domain_name text, avg_self numeric, avg_observer numeric, delta numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as eval_id,
    e.updated_at as submitted_at,
    e.status,
    e.type,
    e.quarter,
    e.program_year,
    ei.domain_name,
    ROUND(AVG(ei.self_score)::numeric, 1) as avg_self,
    ROUND(AVG(ei.observer_score)::numeric, 1) as avg_observer,
    ROUND((AVG(ei.observer_score) - AVG(ei.self_score))::numeric, 1) as delta
  FROM evaluations e
  JOIN evaluation_items ei ON ei.evaluation_id = e.id
  WHERE e.staff_id = p_staff_id
    AND (NOT p_only_submitted OR e.status = 'submitted')
    AND ei.domain_name IS NOT NULL
    AND (ei.self_score IS NOT NULL OR ei.observer_score IS NOT NULL)
  GROUP BY e.id, e.updated_at, e.status, e.type, e.quarter, e.program_year, ei.domain_name
  ORDER BY e.updated_at DESC, ei.domain_name;
END;
$function$

-- Add RLS policy for users to read only their submitted evaluations
DROP POLICY IF EXISTS "Staff can read submitted evaluations" ON evaluations;
CREATE POLICY "Staff can read submitted evaluations" 
ON evaluations FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM staff s 
    WHERE s.id = evaluations.staff_id 
      AND s.user_id = auth.uid()
  ) 
  AND status = 'submitted'
);

-- Add RLS policy for evaluation_items to match parent evaluation access
DROP POLICY IF EXISTS "Staff can read items from submitted evaluations" ON evaluation_items;
CREATE POLICY "Staff can read items from submitted evaluations"
ON evaluation_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM evaluations e
    JOIN staff s ON s.id = e.staff_id
    WHERE e.id = evaluation_items.evaluation_id
      AND s.user_id = auth.uid()
      AND e.status = 'submitted'
  )
);