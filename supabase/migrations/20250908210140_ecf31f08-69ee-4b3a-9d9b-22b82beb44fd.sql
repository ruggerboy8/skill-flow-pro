-- Fix the touch_dates trigger to only set dates when scores are non-null
CREATE OR REPLACE FUNCTION public.touch_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only set confidence_date when confidence_score is being set to a non-null value
  IF (NEW.confidence_score IS DISTINCT FROM OLD.confidence_score AND NEW.confidence_score IS NOT NULL)
     OR (TG_OP = 'INSERT' AND NEW.confidence_score IS NOT NULL) THEN
    NEW.confidence_date := now();
  END IF;
  
  -- Only set performance_date when performance_score is being set to a non-null value  
  IF (NEW.performance_score IS DISTINCT FROM OLD.performance_score AND NEW.performance_score IS NOT NULL)
     OR (TG_OP = 'INSERT' AND NEW.performance_score IS NOT NULL) THEN
    NEW.performance_date := now();
  END IF;
  
  -- Clear confidence_date when confidence_score is being set to null
  IF NEW.confidence_score IS NULL AND OLD.confidence_score IS NOT NULL THEN
    NEW.confidence_date := NULL;
  END IF;
  
  -- Clear performance_date when performance_score is being set to null
  IF NEW.performance_score IS NULL AND OLD.performance_score IS NOT NULL THEN
    NEW.performance_date := NULL;
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- Clean up existing inconsistent data
-- Set confidence_date to NULL where confidence_score is NULL but confidence_date is not NULL
UPDATE public.weekly_scores 
SET confidence_date = NULL 
WHERE confidence_score IS NULL AND confidence_date IS NOT NULL;

-- Set performance_date to NULL where performance_score is NULL but performance_date is not NULL
UPDATE public.weekly_scores 
SET performance_date = NULL 
WHERE performance_score IS NULL AND performance_date IS NOT NULL;

-- Add logging function for score updates
CREATE OR REPLACE FUNCTION public.log_score_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Log when scores are being set to null unexpectedly
  IF TG_OP = 'UPDATE' THEN
    IF OLD.confidence_score IS NOT NULL AND NEW.confidence_score IS NULL THEN
      RAISE LOG 'Confidence score cleared for staff_id: %, weekly_focus_id: %, old_score: %', 
        NEW.staff_id, NEW.weekly_focus_id, OLD.confidence_score;
    END IF;
    
    IF OLD.performance_score IS NOT NULL AND NEW.performance_score IS NULL THEN
      RAISE LOG 'Performance score cleared for staff_id: %, weekly_focus_id: %, old_score: %', 
        NEW.staff_id, NEW.weekly_focus_id, OLD.performance_score;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for score update logging
DROP TRIGGER IF EXISTS log_weekly_scores_updates ON public.weekly_scores;
CREATE TRIGGER log_weekly_scores_updates
  BEFORE UPDATE ON public.weekly_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.log_score_update();