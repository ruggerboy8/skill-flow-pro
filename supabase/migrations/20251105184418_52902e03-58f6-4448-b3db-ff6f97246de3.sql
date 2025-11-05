-- Create seq_latest_quarterly_evals RPC function
-- Returns latest quarterly eval scores per competency (Alcan-wide) for a given role
CREATE OR REPLACE FUNCTION public.seq_latest_quarterly_evals(role_id_arg INT)
RETURNS TABLE(competency_id INT, score DOUBLE PRECISION)
LANGUAGE SQL
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH latest_eval_per_staff AS (
    SELECT DISTINCT ON (e.staff_id)
           e.id AS evaluation_id
    FROM evaluations e
    WHERE e.type = 'Quarterly'
      AND e.status = 'submitted'
    ORDER BY e.staff_id, e.updated_at DESC
  )
  SELECT ei.competency_id::INT,
         AVG((ei.observer_score)::DOUBLE PRECISION / 10.0) AS score
  FROM evaluation_items ei
  JOIN latest_eval_per_staff le ON le.evaluation_id = ei.evaluation_id
  JOIN competencies c ON c.competency_id = ei.competency_id
  WHERE c.role_id = role_id_arg
    AND ei.observer_score IS NOT NULL
  GROUP BY ei.competency_id
$$;

GRANT EXECUTE ON FUNCTION public.seq_latest_quarterly_evals(INT) 
TO anon, authenticated, service_role;