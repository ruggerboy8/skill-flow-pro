-- Add scope fields to staff table
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS coach_scope_type text CHECK (coach_scope_type IN ('org','location')) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS coach_scope_id uuid DEFAULT NULL;

COMMENT ON COLUMN public.staff.coach_scope_type IS 'Scope type for coaches/leads: org (organization) or location';
COMMENT ON COLUMN public.staff.coach_scope_id IS 'UUID of the organization or location for coach/lead scope';

-- Add index for scope queries
CREATE INDEX IF NOT EXISTS staff_coach_scope_idx ON public.staff(coach_scope_type, coach_scope_id) WHERE coach_scope_id IS NOT NULL;