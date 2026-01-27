-- Fix the existing OM user
UPDATE staff 
SET is_office_manager = true 
WHERE id = '152aa88d-6954-4977-99ce-61b2045388f7';

-- Add coach_scope for their location (required for OM visibility)
INSERT INTO coach_scopes (staff_id, scope_type, scope_id)
VALUES ('152aa88d-6954-4977-99ce-61b2045388f7', 'location', 'c8524ee6-c716-441b-b7bc-0fb1e728d853')
ON CONFLICT DO NOTHING;