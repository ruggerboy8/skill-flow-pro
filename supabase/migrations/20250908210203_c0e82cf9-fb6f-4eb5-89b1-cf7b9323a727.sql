-- Fix search_path security issues for the functions we just created
CREATE OR REPLACE FUNCTION public.touch_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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

-- Fix search_path security issue for logging function
CREATE OR REPLACE FUNCTION public.log_score_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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