-- Security fixes migration

-- 1. Fix critical RLS vulnerability: Prevent users from escalating their own privileges
-- Drop the existing policy that allows users to manage ALL their own records
DROP POLICY IF EXISTS "Users can manage own records" ON public.staff;

-- Create separate policies for different operations
-- Allow users to read their own record
CREATE POLICY "Users can view own record" 
ON public.staff 
FOR SELECT 
USING (user_id = auth.uid());

-- Allow users to update their own record but NOT privilege fields
CREATE POLICY "Users can update own profile" 
ON public.staff 
FOR UPDATE 
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid() AND
  -- Prevent privilege escalation by ensuring these fields don't change
  is_coach = (SELECT is_coach FROM public.staff WHERE user_id = auth.uid()) AND
  is_super_admin = (SELECT is_super_admin FROM public.staff WHERE user_id = auth.uid())
);

-- Allow users to insert their own record (for initial profile creation)
CREATE POLICY "Users can create own profile" 
ON public.staff 
FOR INSERT 
WITH CHECK (
  user_id = auth.uid() AND
  -- New users cannot grant themselves privileges
  is_coach = false AND
  is_super_admin = false
);

-- Only coaches/admins can modify privilege fields
CREATE POLICY "Coaches can manage staff privileges" 
ON public.staff 
FOR UPDATE 
USING (is_coach_or_admin(auth.uid()))
WITH CHECK (is_coach_or_admin(auth.uid()));

-- 2. Fix nullable user_id vulnerability
-- Make user_id NOT NULL to prevent RLS bypasses
ALTER TABLE public.staff ALTER COLUMN user_id SET NOT NULL;

-- 3. Add input validation constraints
-- Add reasonable length limits for text fields
ALTER TABLE public.staff 
ADD CONSTRAINT staff_name_length CHECK (char_length(name) BETWEEN 1 AND 100),
ADD CONSTRAINT staff_email_length CHECK (char_length(email) BETWEEN 5 AND 254),
ADD CONSTRAINT staff_organization_length CHECK (organization IS NULL OR char_length(organization) BETWEEN 1 AND 100),
ADD CONSTRAINT staff_location_length CHECK (location IS NULL OR char_length(location) BETWEEN 1 AND 100),
ADD CONSTRAINT staff_primary_location_length CHECK (primary_location IS NULL OR char_length(primary_location) BETWEEN 1 AND 100);

-- Add email format validation
ALTER TABLE public.staff 
ADD CONSTRAINT staff_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- Add validation for score ranges in weekly_scores
ALTER TABLE public.weekly_scores 
ADD CONSTRAINT confidence_score_range CHECK (confidence_score IS NULL OR (confidence_score >= 1 AND confidence_score <= 4)),
ADD CONSTRAINT performance_score_range CHECK (performance_score IS NULL OR (performance_score >= 1 AND performance_score <= 4));

-- 4. Create security function to prevent view-related issues
-- Replace any problematic views with secure functions
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

-- 5. Add audit logging for privilege changes
CREATE TABLE IF NOT EXISTS public.staff_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  changed_by uuid NOT NULL,
  field_changed text NOT NULL,
  old_value text,
  new_value text,
  changed_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on audit table
ALTER TABLE public.staff_audit ENABLE ROW LEVEL SECURITY;

-- Only coaches can read audit logs
CREATE POLICY "Coaches can read audit logs" 
ON public.staff_audit 
FOR SELECT 
USING (is_coach_or_admin(auth.uid()));

-- Create trigger function for audit logging
CREATE OR REPLACE FUNCTION public.audit_staff_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

-- Create trigger for audit logging
DROP TRIGGER IF EXISTS audit_staff_privilege_changes ON public.staff;
CREATE TRIGGER audit_staff_privilege_changes
  AFTER UPDATE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_staff_changes();