-- Add retirement audit columns to pro_moves
ALTER TABLE public.pro_moves 
ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS retired_by UUID REFERENCES staff(id);

-- Add comment for documentation
COMMENT ON COLUMN public.pro_moves.retired_at IS 'Timestamp when the pro move was retired (active set to false)';
COMMENT ON COLUMN public.pro_moves.retired_by IS 'Staff ID of the admin who retired this pro move';