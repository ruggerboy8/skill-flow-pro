-- Allow authenticated users to read global weekly plans (org_id IS NULL)
-- This is needed for the planner History panel
CREATE POLICY "Authenticated users can read global weekly plans"
ON public.weekly_plan
FOR SELECT
TO authenticated
USING (org_id IS NULL);

-- Ensure super admins can read plan history via weekly_plan with joins
-- (Already covered by existing "Super admins manage all weekly plans" policy)