-- Create coach_scopes junction table for multi-scope support
CREATE TABLE IF NOT EXISTS public.coach_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  scope_type text NOT NULL CHECK (scope_type IN ('org', 'location')),
  scope_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, scope_type, scope_id)
);

-- Enable RLS
ALTER TABLE public.coach_scopes ENABLE ROW LEVEL SECURITY;

-- Super admins can manage all scopes
CREATE POLICY "Super admins can manage coach scopes"
ON public.coach_scopes
FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Coaches can read their own scopes
CREATE POLICY "Coaches can read their own scopes"
ON public.coach_scopes
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM staff s
    WHERE s.id = coach_scopes.staff_id
    AND s.user_id = auth.uid()
  )
);

-- Create index for performance
CREATE INDEX idx_coach_scopes_staff_id ON public.coach_scopes(staff_id);
CREATE INDEX idx_coach_scopes_scope ON public.coach_scopes(scope_type, scope_id);

-- Migrate existing single-scope data to junction table
INSERT INTO public.coach_scopes (staff_id, scope_type, scope_id)
SELECT id, coach_scope_type, coach_scope_id
FROM public.staff
WHERE coach_scope_type IS NOT NULL 
  AND coach_scope_id IS NOT NULL
  AND is_coach = true
ON CONFLICT (staff_id, scope_type, scope_id) DO NOTHING;