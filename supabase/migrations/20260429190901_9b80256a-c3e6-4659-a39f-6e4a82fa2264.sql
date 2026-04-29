ALTER TABLE public.pro_moves
  ADD COLUMN IF NOT EXISTS conditionally_applicable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pro_moves.conditionally_applicable IS
  'When true, doctors may mark this Pro Move N/A (score = 0) during their self-assessment. Stopgap for items that do not apply at every site.';