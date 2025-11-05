-- Migration: Enable RLS and add security policies for weekly_plan and sequencer_runs

-- 1) Enable RLS on both tables
ALTER TABLE weekly_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequencer_runs ENABLE ROW LEVEL SECURITY;

-- 2) Create helper function to check if org is allowed for sequencing
CREATE OR REPLACE FUNCTION is_org_allowed_for_sequencing(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- If no allowed list exists, all orgs are allowed
    WHEN NOT EXISTS (SELECT 1 FROM app_kv WHERE key = 'sequencer:allowed_org_ids') THEN true
    -- If allowed list is empty array, all orgs are allowed
    WHEN (SELECT jsonb_array_length(value->'org_ids') = 0 FROM app_kv WHERE key = 'sequencer:allowed_org_ids') THEN true
    -- Otherwise check if org is in the list
    ELSE p_org_id::text IN (
      SELECT jsonb_array_elements_text(value->'org_ids')
      FROM app_kv
      WHERE key = 'sequencer:allowed_org_ids'
    )
  END;
$$;

-- 3) RLS Policies for weekly_plan

-- Super admins can do anything
CREATE POLICY "Super admins manage all weekly plans"
ON weekly_plan FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Users can view their own org's plans
CREATE POLICY "Users view own org weekly plans"
ON weekly_plan FOR SELECT
TO authenticated
USING (
  org_id IN (
    SELECT l.organization_id 
    FROM staff s 
    JOIN locations l ON l.id = s.primary_location_id
    WHERE s.user_id = auth.uid()
  )
);

-- GUARDRAIL: Only allow writes to orgs in allowed list
CREATE POLICY "System can write to allowed orgs only"
ON weekly_plan FOR INSERT
TO authenticated
WITH CHECK (is_org_allowed_for_sequencing(org_id));

CREATE POLICY "System can update allowed orgs only"
ON weekly_plan FOR UPDATE
TO authenticated
USING (is_org_allowed_for_sequencing(org_id))
WITH CHECK (is_org_allowed_for_sequencing(org_id));

-- 4) RLS Policies for sequencer_runs

-- Super admins can view runs
CREATE POLICY "Super admins view sequencer runs"
ON sequencer_runs FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()));

-- GUARDRAIL: Only allow inserts for allowed orgs
CREATE POLICY "Service role inserts sequencer runs for allowed orgs"
ON sequencer_runs FOR INSERT
TO authenticated
WITH CHECK (is_org_allowed_for_sequencing(org_id));