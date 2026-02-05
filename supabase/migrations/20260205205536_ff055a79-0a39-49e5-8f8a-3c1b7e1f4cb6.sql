
-- Set a color for the Clinical domain (domain_id 1) if missing
UPDATE domains SET color_hex = '#3B82F6' WHERE domain_id = 1 AND color_hex IS NULL;
