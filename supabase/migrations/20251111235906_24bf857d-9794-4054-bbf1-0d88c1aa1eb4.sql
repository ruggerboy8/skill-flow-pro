-- Update pro_move_resources constraints to support audio with Hume provider

-- Drop existing constraints
ALTER TABLE pro_move_resources 
DROP CONSTRAINT IF EXISTS pro_move_resources_provider_check;

ALTER TABLE pro_move_resources 
DROP CONSTRAINT IF EXISTS pro_move_resources_type_check;

-- Add updated constraints
ALTER TABLE pro_move_resources 
ADD CONSTRAINT pro_move_resources_provider_check 
CHECK (provider = ANY (ARRAY['youtube'::text, 'hume'::text]));

ALTER TABLE pro_move_resources 
ADD CONSTRAINT pro_move_resources_type_check 
CHECK (type = ANY (ARRAY['video'::text, 'script'::text, 'link'::text, 'audio'::text]));