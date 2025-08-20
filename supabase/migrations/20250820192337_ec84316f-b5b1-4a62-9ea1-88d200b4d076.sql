-- Add new organizations
INSERT INTO public.organizations (name, slug) VALUES 
  ('Sprout', 'sprout'),
  ('Kids Tooth Team', 'kids-tooth-team');

-- Add locations for Sprout organization
INSERT INTO public.locations (organization_id, name, slug, timezone, program_start_date, cycle_length_weeks)
SELECT 
  o.id,
  location_name,
  location_slug,
  'America/Chicago',
  '2025-01-06'::date, -- Same program start as main location
  6
FROM public.organizations o
CROSS JOIN (
  VALUES 
    ('McKinney', 'mckinney'),
    ('Frisco', 'frisco'),
    ('Allen', 'allen')
) AS locations(location_name, location_slug)
WHERE o.slug = 'sprout';

-- Add locations for Kids Tooth Team organization  
INSERT INTO public.locations (organization_id, name, slug, timezone, program_start_date, cycle_length_weeks)
SELECT 
  o.id,
  location_name,
  location_slug,
  'America/Chicago',
  '2025-01-06'::date, -- Same program start as main location
  6
FROM public.organizations o
CROSS JOIN (
  VALUES 
    ('Buda', 'buda'),
    ('South Austin', 'south-austin'),
    ('Kyle', 'kyle')
) AS locations(location_name, location_slug)
WHERE o.slug = 'kids-tooth-team';

-- Update existing staff members to have location assignments
-- For now, assign all existing staff to the main location if they don't have one
UPDATE public.staff 
SET primary_location_id = (
  SELECT id FROM public.locations WHERE slug = 'main'
)
WHERE primary_location_id IS NULL;