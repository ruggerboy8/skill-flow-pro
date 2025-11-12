-- Step 1: Delete the orphaned scores immediately
DELETE FROM weekly_scores 
WHERE weekly_focus_id IN ('plan:371', 'plan:372', 'plan:373');

-- Step 2: Fix the delete_week_data_by_week function to handle both old and new formats
CREATE OR REPLACE FUNCTION public.delete_week_data_by_week(
  p_staff_id uuid, 
  p_role_id bigint, 
  p_week_of date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text;
  v_deleted_scores int := 0;
  v_deleted_selections int := 0;
  v_user_id uuid;
  focus_ids_to_delete text[];
BEGIN
  -- Check super admin
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Super admin required.';
  END IF;

  -- Get timezone and user_id
  SELECT l.timezone, s.user_id
  INTO v_tz, v_user_id
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.id = p_staff_id;

  IF v_tz IS NULL THEN
    RAISE EXCEPTION 'No location/timezone found for staff';
  END IF;

  -- Step 1: Collect ALL weekly_focus_id values to delete (both old and new formats)
  SELECT array_agg(DISTINCT ws.weekly_focus_id) INTO focus_ids_to_delete
  FROM weekly_scores ws
  WHERE ws.staff_id = p_staff_id
    AND (
      -- Old format: weekly_focus table (cycle >= 4)
      ws.weekly_focus_id IN (
        SELECT wf.id::text 
        FROM weekly_focus wf
        WHERE wf.role_id = p_role_id
          AND wf.cycle >= 4
      )
      OR
      -- New format: weekly_plan table (plan:{id})
      ws.weekly_focus_id IN (
        SELECT 'plan:' || wp.id 
        FROM weekly_plan wp
        WHERE wp.role_id = p_role_id
          AND wp.org_id IS NULL
          AND wp.week_start_date = p_week_of
      )
    )
    AND date_trunc('week', 
      COALESCE(ws.performance_date, ws.confidence_date, ws.created_at) 
      AT TIME ZONE v_tz
    )::date = p_week_of;

  -- Step 2: Delete scores using the captured list
  DELETE FROM weekly_scores
  WHERE staff_id = p_staff_id
    AND weekly_focus_id = ANY(focus_ids_to_delete);
  
  GET DIAGNOSTICS v_deleted_scores = ROW_COUNT;

  -- Step 3: Delete weekly_self_select using the captured list
  DELETE FROM weekly_self_select
  WHERE user_id = v_user_id
    AND weekly_focus_id = ANY(focus_ids_to_delete);
  
  GET DIAGNOSTICS v_deleted_selections = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Deleted data for week of %s', p_week_of),
    'deleted_scores', v_deleted_scores,
    'deleted_selections', v_deleted_selections
  );
END;
$function$;