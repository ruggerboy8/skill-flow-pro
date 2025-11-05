-- Migration: Create onboarding progress view and gate check function (fixed types)

-- View to track onboarding progress
CREATE OR REPLACE VIEW v_onboarding_progress AS
SELECT 
  l.id as location_id,
  l.name as location_name,
  l.organization_id as org_id,
  l.program_start_date,
  l.cycle_length_weeks,
  l.onboarding_active,
  CASE 
    WHEN r.role_id = 1 THEN 'DFI'
    WHEN r.role_id = 2 THEN 'RDA'
  END as role_name,
  r.role_id,
  -- Calculate current cycle/week based on program start (with proper casting)
  GREATEST(1, (FLOOR((CURRENT_DATE - l.program_start_date::date)::numeric / 7 / l.cycle_length_weeks) + 1)::integer) as current_cycle,
  GREATEST(1, ((FLOOR((CURRENT_DATE - l.program_start_date::date)::numeric / 7)::integer % l.cycle_length_weeks) + 1)) as current_week
FROM locations l
CROSS JOIN roles r
WHERE l.active = true
  AND l.onboarding_active = true
  AND r.role_id IN (1, 2);

-- RPC to check if gate is open (any active location at C3W6)
CREATE OR REPLACE FUNCTION check_sequencer_gate(p_org_id uuid, p_role_id int DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gate_open boolean;
  first_location jsonb;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM v_onboarding_progress
    WHERE current_cycle = 3 
      AND current_week = 6
      AND org_id = p_org_id
      AND onboarding_active = true
      AND (p_role_id IS NULL OR role_id = p_role_id)
  ) INTO gate_open;
  
  IF gate_open THEN
    SELECT jsonb_build_object(
      'location_id', location_id,
      'location_name', location_name,
      'role_id', role_id,
      'role_name', role_name,
      'org_id', org_id
    ) INTO first_location
    FROM v_onboarding_progress
    WHERE current_cycle = 3 
      AND current_week = 6
      AND org_id = p_org_id
      AND onboarding_active = true
      AND (p_role_id IS NULL OR role_id = p_role_id)
    LIMIT 1;
  END IF;
  
  RETURN jsonb_build_object(
    'gate_open', gate_open,
    'first_location_ready', first_location
  );
END;
$$;