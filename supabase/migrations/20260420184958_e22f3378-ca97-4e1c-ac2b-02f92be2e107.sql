-- Assign doctors to their primary locations
-- Justin Chan -> Frisco; Sage Yoo -> Allen
UPDATE public.staff
SET primary_location_id = '2b804783-93a2-4b3a-8ae7-5e61b08a2887'  -- Frisco
WHERE id = 'c838a862-ef76-4979-be31-8837bc82dbbd';

UPDATE public.staff
SET primary_location_id = '9f3c7067-53d5-472e-8d98-ea2fb037d739'  -- Allen
WHERE id = '40abc9da-65ad-48d1-b7c2-7a3e4461693e';