-- Add NA boolean columns to evaluation_items
ALTER TABLE evaluation_items 
ADD COLUMN observer_is_na BOOLEAN DEFAULT FALSE,
ADD COLUMN self_is_na BOOLEAN DEFAULT FALSE;