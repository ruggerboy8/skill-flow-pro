-- Fix security issue: set search_path for the is_superadmin function
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean 
LANGUAGE sql 
STABLE 
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.staff
    WHERE user_id = auth.uid() AND is_super_admin = true
  );
$$;