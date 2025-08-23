-- Create function to safely delete a user's most recent week data
-- Only allows deletion of the most recently completed week to maintain data integrity
CREATE OR REPLACE FUNCTION public.delete_latest_week_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  staff_record staff%ROWTYPE;
  latest_week_id uuid;
  deleted_scores_count integer := 0;
  deleted_selections_count integer := 0;
BEGIN
  -- Check if user is super admin
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied. Super admin required.';
  END IF;
  
  -- Get staff record for the user
  SELECT * INTO staff_record
  FROM public.staff 
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff record not found for user.';
  END IF;
  
  -- Find the most recent week with data (latest weekly_focus_id with scores)
  SELECT ws.weekly_focus_id INTO latest_week_id
  FROM public.weekly_scores ws
  JOIN public.weekly_focus wf ON wf.id = ws.weekly_focus_id
  WHERE ws.staff_id = staff_record.id
    AND (ws.confidence_score IS NOT NULL OR ws.performance_score IS NOT NULL)
  ORDER BY ws.created_at DESC
  LIMIT 1;
  
  IF latest_week_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'No completed weeks found to delete.'
    );
  END IF;
  
  -- Delete weekly scores for this week
  DELETE FROM public.weekly_scores 
  WHERE staff_id = staff_record.id 
    AND weekly_focus_id IN (
      SELECT id FROM public.weekly_focus wf2 
      WHERE wf2.cycle = (SELECT cycle FROM public.weekly_focus WHERE id = latest_week_id)
        AND wf2.week_in_cycle = (SELECT week_in_cycle FROM public.weekly_focus WHERE id = latest_week_id)
        AND wf2.role_id = staff_record.role_id
    );
  
  GET DIAGNOSTICS deleted_scores_count = ROW_COUNT;
  
  -- Delete weekly self-selections for this week  
  DELETE FROM public.weekly_self_select
  WHERE user_id = p_user_id
    AND weekly_focus_id IN (
      SELECT id FROM public.weekly_focus wf2 
      WHERE wf2.cycle = (SELECT cycle FROM public.weekly_focus WHERE id = latest_week_id)
        AND wf2.week_in_cycle = (SELECT week_in_cycle FROM public.weekly_focus WHERE id = latest_week_id)
        AND wf2.role_id = staff_record.role_id
    );
    
  GET DIAGNOSTICS deleted_selections_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Latest week data deleted successfully.',
    'deleted_scores', deleted_scores_count,
    'deleted_selections', deleted_selections_count
  );
END;
$function$;