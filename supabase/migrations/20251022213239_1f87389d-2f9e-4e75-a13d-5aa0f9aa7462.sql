-- Add roles_updated_at column to track when roles change
ALTER TABLE public.staff 
ADD COLUMN IF NOT EXISTS roles_updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create trigger function to update roles_updated_at when role fields change
CREATE OR REPLACE FUNCTION public.update_roles_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only update roles_updated_at if role-related fields have changed
  IF (OLD.is_coach IS DISTINCT FROM NEW.is_coach) OR
     (OLD.is_super_admin IS DISTINCT FROM NEW.is_super_admin) OR
     (OLD.is_participant IS DISTINCT FROM NEW.is_participant) OR
     (OLD.is_lead IS DISTINCT FROM NEW.is_lead) OR
     (OLD.role_id IS DISTINCT FROM NEW.role_id) OR
     (OLD.coach_scope_type IS DISTINCT FROM NEW.coach_scope_type) OR
     (OLD.coach_scope_id IS DISTINCT FROM NEW.coach_scope_id) THEN
    NEW.roles_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on staff table
DROP TRIGGER IF EXISTS trigger_update_roles_timestamp ON public.staff;
CREATE TRIGGER trigger_update_roles_timestamp
  BEFORE UPDATE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.update_roles_timestamp();