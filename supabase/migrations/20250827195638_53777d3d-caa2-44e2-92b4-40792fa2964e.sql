-- Fix the audit trigger to handle manual changes from Supabase dashboard
-- where auth.uid() might be null (service role context)

CREATE OR REPLACE FUNCTION public.audit_staff_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Log privilege changes
  IF OLD.is_coach != NEW.is_coach THEN
    INSERT INTO public.staff_audit (staff_id, changed_by, field_changed, old_value, new_value)
    VALUES (
      NEW.id, 
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), -- Use a system UUID when auth.uid() is null
      'is_coach', 
      OLD.is_coach::text, 
      NEW.is_coach::text
    );
  END IF;
  
  IF OLD.is_super_admin != NEW.is_super_admin THEN
    INSERT INTO public.staff_audit (staff_id, changed_by, field_changed, old_value, new_value)
    VALUES (
      NEW.id, 
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid), -- Use a system UUID when auth.uid() is null
      'is_super_admin', 
      OLD.is_super_admin::text, 
      NEW.is_super_admin::text
    );
  END IF;
  
  RETURN NEW;
END;
$function$;