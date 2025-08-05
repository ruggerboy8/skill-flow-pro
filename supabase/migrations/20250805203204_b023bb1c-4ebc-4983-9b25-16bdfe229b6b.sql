-- Fix remaining security issues

-- 1. Fix search path for new functions
CREATE OR REPLACE FUNCTION public.get_staff_summary()
RETURNS TABLE(
  staff_id uuid,
  name text,
  email text,
  role_id bigint,
  organization text,
  location text,
  is_coach boolean,
  is_super_admin boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
  SELECT 
    s.id,
    s.name,
    s.email,
    s.role_id,
    s.organization,
    s.location,
    s.is_coach,
    s.is_super_admin
  FROM public.staff s
  WHERE 
    -- Apply RLS: users see their own record, coaches see all
    s.user_id = auth.uid() 
    OR is_coach_or_admin(auth.uid());
$$;

-- Fix audit function search path
CREATE OR REPLACE FUNCTION public.audit_staff_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Log privilege changes
  IF OLD.is_coach != NEW.is_coach THEN
    INSERT INTO public.staff_audit (staff_id, changed_by, field_changed, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'is_coach', OLD.is_coach::text, NEW.is_coach::text);
  END IF;
  
  IF OLD.is_super_admin != NEW.is_super_admin THEN
    INSERT INTO public.staff_audit (staff_id, changed_by, field_changed, old_value, new_value)
    VALUES (NEW.id, auth.uid(), 'is_super_admin', OLD.is_super_admin::text, NEW.is_super_admin::text);
  END IF;
  
  RETURN NEW;
END;
$$;

-- 2. Remove any problematic Security Definer views
-- Drop views that might be causing the security definer view warning
DROP VIEW IF EXISTS public.v_admins;

-- Create a secure function instead of a view for admin checking
CREATE OR REPLACE FUNCTION public.get_user_admin_status()
RETURNS TABLE(
  user_id uuid,
  coach boolean,
  super_admin boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = 'public'
AS $$
  SELECT 
    s.user_id,
    s.is_coach as coach,
    s.is_super_admin as super_admin
  FROM public.staff s
  WHERE s.user_id = auth.uid();
$$;