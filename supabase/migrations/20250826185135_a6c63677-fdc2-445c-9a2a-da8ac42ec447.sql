-- Add RLS policies for user access to submitted evaluations
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