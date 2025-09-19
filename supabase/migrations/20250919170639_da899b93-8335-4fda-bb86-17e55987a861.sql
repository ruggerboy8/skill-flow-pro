-- Fix evaluation RLS policies to allow proper staff self-assessment workflow
-- while maintaining security for sensitive observer data

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Staff can read submitted evaluations" ON public.evaluations;
DROP POLICY IF EXISTS "Staff can read items from submitted evaluations" ON public.evaluation_items;

-- Create new policies for evaluations table
CREATE POLICY "Staff can read own evaluations" ON public.evaluations
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM staff s 
    WHERE s.id = evaluations.staff_id 
    AND s.user_id = auth.uid()
  )
);

-- Create new policies for evaluation_items table  
CREATE POLICY "Staff can read own evaluation items" ON public.evaluation_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM evaluations e
    JOIN staff s ON s.id = e.staff_id
    WHERE e.id = evaluation_items.evaluation_id 
    AND s.user_id = auth.uid()
  )
);

-- Allow staff to update only their self-assessment fields
CREATE POLICY "Staff can update own self-assessment" ON public.evaluation_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM evaluations e
    JOIN staff s ON s.id = e.staff_id
    WHERE e.id = evaluation_items.evaluation_id 
    AND s.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM evaluations e
    JOIN staff s ON s.id = e.staff_id
    WHERE e.id = evaluation_items.evaluation_id 
    AND s.user_id = auth.uid()
  )
  -- Ensure staff can only modify self-assessment fields
  AND (
    (OLD.observer_score IS NOT DISTINCT FROM NEW.observer_score)
    AND (OLD.observer_note IS NOT DISTINCT FROM NEW.observer_note)
    AND (OLD.competency_id IS NOT DISTINCT FROM NEW.competency_id)
    AND (OLD.evaluation_id IS NOT DISTINCT FROM NEW.evaluation_id)
    AND (OLD.competency_name_snapshot IS NOT DISTINCT FROM NEW.competency_name_snapshot)
    AND (OLD.competency_description_snapshot IS NOT DISTINCT FROM NEW.competency_description_snapshot)
    AND (OLD.interview_prompt_snapshot IS NOT DISTINCT FROM NEW.interview_prompt_snapshot)
    AND (OLD.domain_id IS NOT DISTINCT FROM NEW.domain_id)
    AND (OLD.domain_name IS NOT DISTINCT FROM NEW.domain_name)
  )
);