-- Create organizations table
CREATE TABLE public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Create locations table
CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Chicago',
  program_start_date DATE NOT NULL,
  cycle_length_weeks INTEGER NOT NULL DEFAULT 6,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on locations
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Add primary_location_id to staff table
ALTER TABLE public.staff ADD COLUMN primary_location_id UUID REFERENCES public.locations(id);

-- Create indexes for better performance
CREATE INDEX idx_locations_organization_id ON public.locations(organization_id);
CREATE INDEX idx_staff_primary_location_id ON public.staff(primary_location_id);

-- RLS policies for organizations
CREATE POLICY "Everyone can read organizations" 
ON public.organizations 
FOR SELECT 
USING (true);

CREATE POLICY "Super admins can manage organizations" 
ON public.organizations 
FOR ALL 
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- RLS policies for locations
CREATE POLICY "Everyone can read locations" 
ON public.locations 
FOR SELECT 
USING (true);

CREATE POLICY "Super admins can manage locations" 
ON public.locations 
FOR ALL 
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Insert seed data - Main organization
INSERT INTO public.organizations (name, slug) VALUES ('Main Organization', 'main');

-- Insert seed data - Main location with current program start (first Monday of 2025)
INSERT INTO public.locations (organization_id, name, slug, timezone, program_start_date, cycle_length_weeks)
SELECT 
  o.id,
  'Main Location',
  'main',
  'America/Chicago',
  '2025-01-06'::date, -- First Monday of 2025
  6
FROM public.organizations o WHERE o.slug = 'main';

-- Update existing staff to use the main location
UPDATE public.staff 
SET primary_location_id = (
  SELECT id FROM public.locations WHERE slug = 'main'
)
WHERE primary_location_id IS NULL;