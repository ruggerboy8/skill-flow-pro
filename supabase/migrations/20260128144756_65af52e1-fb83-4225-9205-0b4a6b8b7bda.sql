-- Add visibility column to evaluations table
-- Default to false (hidden until admin explicitly releases)
ALTER TABLE public.evaluations 
ADD COLUMN is_visible_to_staff boolean NOT NULL DEFAULT false;

-- Create partial index for efficient filtering of visible evaluations
CREATE INDEX idx_evaluations_visible 
ON public.evaluations(is_visible_to_staff) 
WHERE is_visible_to_staff = true;

-- Comment explaining the column purpose
COMMENT ON COLUMN public.evaluations.is_visible_to_staff IS 'Controls whether participants can see their evaluation results. Defaults to false until admin delivers results.';