-- Add missing active columns to organizations and locations
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

ALTER TABLE public.locations 
ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- Create wrapper function for consistent policy usage
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean 
LANGUAGE sql 
STABLE 
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.staff
    WHERE user_id = auth.uid() AND is_super_admin = true
  );
$$;

-- Ensure RLS is enabled on all admin tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- Drop existing conflicting policies and create new consistent ones
DROP POLICY IF EXISTS "Everyone can read organizations" ON public.organizations;
DROP POLICY IF EXISTS "Super admins can manage organizations" ON public.organizations;
DROP POLICY IF EXISTS org_admin_all ON public.organizations;

CREATE POLICY org_admin_all ON public.organizations
FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "Everyone can read locations" ON public.locations;
DROP POLICY IF EXISTS "Super admins can manage locations" ON public.locations;
DROP POLICY IF EXISTS loc_admin_all ON public.locations;

CREATE POLICY loc_admin_all ON public.locations
FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- Add policy for staff admin access (supplement existing policies)
DROP POLICY IF EXISTS staff_admin_all ON public.staff;
CREATE POLICY staff_admin_all ON public.staff
FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- Ensure proper foreign key constraints (drop and recreate if exists)
ALTER TABLE public.locations 
ADD COLUMN IF NOT EXISTS organization_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'locations_org_fkey' 
        AND table_name = 'locations'
    ) THEN
        ALTER TABLE public.locations
        ADD CONSTRAINT locations_org_fkey 
        FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;
    END IF;
END $$;