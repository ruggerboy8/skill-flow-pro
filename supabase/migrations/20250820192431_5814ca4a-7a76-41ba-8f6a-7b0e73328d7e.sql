-- Add Kids Tooth Team organization (if it doesn't exist)
INSERT INTO public.organizations (name, slug) 
SELECT 'Kids Tooth Team', 'kids-tooth-team'
WHERE NOT EXISTS (
  SELECT 1 FROM public.organizations WHERE slug = 'kids-tooth-team'
);

-- Add locations for Sprout organization (if they don't exist)
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
WHERE o.slug = 'sprout'
  AND NOT EXISTS (
    SELECT 1 FROM public.locations l2 
    WHERE l2.organization_id = o.id 
    AND l2.slug = location_slug
  );

-- Add locations for Kids Tooth Team organization (if they don't exist)
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
WHERE o.slug = 'kids-tooth-team'
  AND NOT EXISTS (
    SELECT 1 FROM public.locations l2 
    WHERE l2.organization_id = o.id 
    AND l2.slug = location_slug
  );

-- Ensure all existing staff have location assignments
UPDATE public.staff 
SET primary_location_id = (
  SELECT id FROM public.locations WHERE slug = 'main'
)
WHERE primary_location_id IS NULL;