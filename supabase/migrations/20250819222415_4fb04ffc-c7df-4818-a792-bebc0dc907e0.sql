-- Create RPC function to replace weekly focus atomically
CREATE OR REPLACE FUNCTION public.replace_weekly_focus(
  p_cycle integer,
  p_week_in_cycle integer,
  p_role_id bigint,
  p_slots jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  slot_count integer;
  self_select_count integer;
  site_move_count integer;
  action_ids bigint[];
  unique_action_ids bigint[];
  slot jsonb;
  inserted_count integer := 0;
BEGIN
  -- Check if user is super admin
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Super admin required.';
  END IF;

  -- Validate slots array
  slot_count := jsonb_array_length(p_slots);
  
  IF slot_count > 3 THEN
    RAISE EXCEPTION 'Maximum 3 moves allowed per week.';
  END IF;

  IF slot_count < 1 THEN
    RAISE EXCEPTION 'At least 1 move required per week.';
  END IF;

  -- Count self-select vs site moves and collect action_ids for duplicate check
  self_select_count := 0;
  site_move_count := 0;
  action_ids := ARRAY[]::bigint[];

  FOR slot IN SELECT * FROM jsonb_array_elements(p_slots)
  LOOP
    IF (slot->>'self_select')::boolean THEN
      self_select_count := self_select_count + 1;
    ELSE
      site_move_count := site_move_count + 1;
      -- Collect action_ids for duplicate checking
      IF slot->>'action_id' IS NOT NULL THEN
        action_ids := array_append(action_ids, (slot->>'action_id')::bigint);
      END IF;
    END IF;
  END LOOP;

  -- Validate rules
  IF self_select_count > 2 THEN
    RAISE EXCEPTION 'Maximum 2 self-select slots allowed per week.';
  END IF;

  IF site_move_count < 1 THEN
    RAISE EXCEPTION 'At least 1 site move required per week.';
  END IF;

  -- Check for duplicate action_ids
  SELECT array_agg(DISTINCT unnest) INTO unique_action_ids FROM unnest(action_ids);
  IF array_length(action_ids, 1) != array_length(unique_action_ids, 1) THEN
    RAISE EXCEPTION 'Duplicate pro-moves are not allowed in the same week.';
  END IF;

  -- Start transaction (implicit in function)
  -- Delete existing weekly focus for this cycle/week/role
  DELETE FROM public.weekly_focus 
  WHERE cycle = p_cycle 
    AND week_in_cycle = p_week_in_cycle 
    AND role_id = p_role_id;

  -- Insert new slots
  FOR i IN 0 .. slot_count - 1
  LOOP
    slot := p_slots->i;
    
    INSERT INTO public.weekly_focus (
      cycle,
      week_in_cycle,
      role_id,
      action_id,
      competency_id,
      self_select,
      universal,
      display_order,
      iso_year,
      iso_week
    ) VALUES (
      p_cycle,
      p_week_in_cycle,
      p_role_id,
      CASE WHEN (slot->>'self_select')::boolean THEN NULL ELSE (slot->>'action_id')::bigint END,
      CASE WHEN (slot->>'self_select')::boolean THEN (slot->>'competency_id')::bigint ELSE NULL END,
      (slot->>'self_select')::boolean,
      false,
      i + 1,
      EXTRACT(YEAR FROM now())::integer,
      EXTRACT(WEEK FROM now())::integer
    );
    
    inserted_count := inserted_count + 1;
  END LOOP;

  RETURN jsonb_build_object('inserted', inserted_count);
END;
$$;