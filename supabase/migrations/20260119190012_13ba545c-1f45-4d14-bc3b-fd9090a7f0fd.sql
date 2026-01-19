-- Add pause columns to staff table for maternity leave / temporary absence
ALTER TABLE public.staff 
ADD COLUMN is_paused BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN paused_at TIMESTAMPTZ,
ADD COLUMN pause_reason TEXT;

COMMENT ON COLUMN public.staff.is_paused IS 'When true, user is temporarily paused and will not accrue missed assignments';
COMMENT ON COLUMN public.staff.paused_at IS 'Timestamp when the user was paused';
COMMENT ON COLUMN public.staff.pause_reason IS 'Optional reason for pause (e.g., Maternity leave - expected return April 2026)';

-- Create index for efficient filtering
CREATE INDEX idx_staff_is_paused ON public.staff(is_paused) WHERE is_paused = true;