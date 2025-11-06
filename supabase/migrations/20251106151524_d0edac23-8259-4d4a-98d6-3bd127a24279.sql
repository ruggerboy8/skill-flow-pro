-- Step 1: Create/update the RLS helper function to allow NULL org_id (global plans)
CREATE OR REPLACE FUNCTION public.is_org_allowed_for_sequencing(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Global plans (NULL org_id) are always allowed
  SELECT CASE 
    WHEN p_org_id IS NULL THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = p_org_id 
        AND o.active = true
    )
  END;
$$;

-- Step 2: Drop existing policies on weekly_plan
DROP POLICY IF EXISTS "System can update allowed orgs only" ON public.weekly_plan;
DROP POLICY IF EXISTS "System can write to allowed orgs only" ON public.weekly_plan;

-- Step 3: Create new policies that explicitly handle global plans (org_id IS NULL)
CREATE POLICY "System can insert global and allowed org plans"
ON public.weekly_plan
FOR INSERT
WITH CHECK (
  -- Allow if it's a global plan (org_id IS NULL) OR an allowed org
  org_id IS NULL OR is_org_allowed_for_sequencing(org_id)
);

CREATE POLICY "System can update global and allowed org plans"
ON public.weekly_plan
FOR UPDATE
USING (
  -- Allow if it's a global plan (org_id IS NULL) OR an allowed org
  org_id IS NULL OR is_org_allowed_for_sequencing(org_id)
)
WITH CHECK (
  org_id IS NULL OR is_org_allowed_for_sequencing(org_id)
);

-- Step 4: Update sequencer_runs policy to handle global plans
DROP POLICY IF EXISTS "Service role inserts sequencer runs for allowed orgs" ON public.sequencer_runs;

CREATE POLICY "Service role inserts sequencer runs for global and allowed orgs"
ON public.sequencer_runs
FOR INSERT
WITH CHECK (
  -- Allow if it's a global plan (org_id IS NULL) OR an allowed org
  org_id IS NULL OR is_org_allowed_for_sequencing(org_id)
);