-- Update needs_backfill function to account for new users
CREATE OR REPLACE FUNCTION public.needs_backfill(p_staff_id uuid, p_role_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  focus_row RECORD;
  missing_weeks integer[] := '{}';
  week_focus_ids uuid[];
  score_row RECORD;
  all_complete boolean;
  staff_start_date timestamptz;
BEGIN
  -- Check if user is new (has participation_start_at set)
  SELECT participation_start_at INTO staff_start_date
  FROM public.staff
  WHERE id = p_staff_id;
  
  -- If user has participation_start_at set, they don't need backfill
  IF staff_start_date IS NOT NULL THEN
    RETURN jsonb_build_object(
      'missingCount', 0,
      'missingWeeks', '[]'::jsonb
    );
  END IF;

  -- Original logic for users who need backfill
  FOR focus_row IN 
    SELECT week_in_cycle, array_agg(id) as focus_ids
    FROM public.weekly_focus
    WHERE cycle = 1 
      AND role_id = p_role_id
      AND week_in_cycle IN (1,2,3,4,5,6)
    GROUP BY week_in_cycle
    ORDER BY week_in_cycle
  LOOP
    -- Check if all focus rows have both scores for this staff
    all_complete := true;
    
    FOR score_row IN 
      SELECT wf.id as focus_id, ws.confidence_score, ws.performance_score
      FROM unnest(focus_row.focus_ids) as wf(id)
      LEFT JOIN public.weekly_scores ws ON ws.weekly_focus_id = wf.id AND ws.staff_id = p_staff_id
    LOOP
      IF score_row.confidence_score IS NULL OR score_row.performance_score IS NULL THEN
        all_complete := false;
        EXIT;
      END IF;
    END LOOP;
    
    IF NOT all_complete THEN
      missing_weeks := array_append(missing_weeks, focus_row.week_in_cycle);
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'missingCount', array_length(missing_weeks, 1),
    'missingWeeks', to_jsonb(missing_weeks)
  );
END;
$function$;