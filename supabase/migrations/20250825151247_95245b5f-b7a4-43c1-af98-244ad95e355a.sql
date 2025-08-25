-- Create RPC functions for backlog v2 operations
CREATE OR REPLACE FUNCTION public.add_backlog_if_missing(
  p_staff_id uuid, 
  p_action_id bigint, 
  p_cycle int, 
  p_week int
) RETURNS void
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_backlog_v2
    WHERE staff_id = p_staff_id AND action_id = p_action_id AND resolved_on IS NULL
  ) THEN
    INSERT INTO public.user_backlog_v2 (staff_id, action_id, source_cycle, source_week)
    VALUES (p_staff_id, p_action_id, p_cycle, p_week);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_backlog_item(
  p_staff_id uuid, 
  p_action_id bigint
) RETURNS void
LANGUAGE sql 
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.user_backlog_v2
  SET resolved_on = current_date
  WHERE staff_id = p_staff_id AND action_id = p_action_id AND resolved_on IS NULL;
$$;