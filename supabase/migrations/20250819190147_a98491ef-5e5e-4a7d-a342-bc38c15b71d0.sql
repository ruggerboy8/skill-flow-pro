-- Fix security warning: add search_path to function
CREATE OR REPLACE FUNCTION public.update_weekly_self_select_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';