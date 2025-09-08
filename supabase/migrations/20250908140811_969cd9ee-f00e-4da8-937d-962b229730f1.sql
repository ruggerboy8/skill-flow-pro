-- Remove the redundant primary_location text column
ALTER TABLE staff DROP COLUMN IF EXISTS primary_location;