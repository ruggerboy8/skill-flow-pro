-- Update all midpoint evaluations to baseline
UPDATE public.evaluations
SET type = 'Baseline'
WHERE LOWER(type) = 'midpoint';