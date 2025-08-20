-- Update evaluations table to include proper type constraints
ALTER TABLE public.evaluations 
DROP CONSTRAINT IF EXISTS evaluations_type_check;

ALTER TABLE public.evaluations 
ADD CONSTRAINT evaluations_type_check 
CHECK (type IN ('Baseline', 'Midpoint', 'Quarterly'));

-- Make quarter nullable since it's only required for Quarterly evaluations
ALTER TABLE public.evaluations 
ALTER COLUMN quarter DROP NOT NULL;

-- Update the unique constraint to include type
ALTER TABLE public.evaluations 
DROP CONSTRAINT IF EXISTS evaluations_staff_id_program_year_quarter_type_key;

-- Create a new unique constraint that allows multiple non-quarterly evaluations per year
-- but still enforces uniqueness for quarterly evaluations per quarter
ALTER TABLE public.evaluations 
ADD CONSTRAINT evaluations_staff_id_program_year_quarter_type_unique 
UNIQUE (staff_id, program_year, quarter, type);