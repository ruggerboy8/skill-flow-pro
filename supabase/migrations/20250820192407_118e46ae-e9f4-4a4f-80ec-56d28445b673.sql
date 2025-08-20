-- Add new organizations only if they don't exist
INSERT INTO public.organizations (name, slug) 
SELECT 'Sprout', 'sprout'
WHERE NOT EXISTS (SELECT 1 FROM public.organizations WHERE name = 'Sprout');

INSERT INTO public.organizations (name, slug) 
SELECT 'Kids Tooth Team', 'kids-tooth-team'
WHERE NOT EXISTS (SELECT 1 FROM public.organizations WHERE name = 'Kids Tooth Team');

-- Add locations for Sprout organization (only if they don't exist)
INSERT INTO public.locations (organization_id, name, slug, timezone, program_start_date, cycle_length_weeks)
SELECT 
  o.id,
  location_name,
  location_slug,
  'America/Chicago',
  '2025-01-06'::date,
  6
FROM public.organizations o
CROSS JOIN (
  VALUES 
    ('McKinney', 'mckinney'),
    ('Frisco', 'frisco'),
    ('Allen', 'allen')
) AS locations(location_name, location_slug)
WHERE o.name = 'Sprout'
  AND NOT EXISTS (
    SELECT 1 FROM public.locations l 
    WHERE l.organization_id = o.id AND l.name = location_name
  );

-- Add locations for Kids Tooth Team organization (only if they don't exist)
INSERT INTO public.locations (organization_id, name, slug, timezone, program_start_date, cycle_length_weeks)
SELECT 
  o.id,
  location_name,
  location_slug,
  'America/Chicago',
  '2025-01-06'::date,
  6
FROM public.organizations o
CROSS JOIN (
  VALUES 
    ('Buda', 'buda'),
    ('South Austin', 'south-austin'),
    ('Kyle', 'kyle')
) AS locations(location_name, location_slug)
WHERE o.name = 'Kids Tooth Team'
  AND NOT EXISTS (
    SELECT 1 FROM public.locations l 
    WHERE l.organization_id = o.id AND l.name = location_name
  );

-- Ensure all existing staff have location assignments
UPDATE public.staff 
SET primary_location_id = (
  SELECT id FROM public.locations WHERE slug = 'main'
)
WHERE primary_location_id IS NULL;