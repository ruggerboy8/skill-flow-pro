-- Fix the Office Manager test account: update location and add coach_scope
-- Staff ID: 152aa88d-6954-4977-99ce-61b2045388f7
-- McKinney location ID: f6408c46-cad0-438b-a939-6132fbe2410f

-- Update staff location to McKinney (if not already done)
UPDATE public.staff 
SET primary_location_id = 'f6408c46-cad0-438b-a939-6132fbe2410f'
WHERE id = '152aa88d-6954-4977-99ce-61b2045388f7';

-- Add the missing coach_scope for this Office Manager
INSERT INTO public.coach_scopes (staff_id, scope_type, scope_id)
VALUES ('152aa88d-6954-4977-99ce-61b2045388f7', 'location', 'f6408c46-cad0-438b-a939-6132fbe2410f')
ON CONFLICT DO NOTHING;