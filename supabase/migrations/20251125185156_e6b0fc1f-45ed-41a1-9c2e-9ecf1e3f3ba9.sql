-- Create table to track exempt weeks
CREATE TABLE public.excused_weeks (
  week_start_date DATE PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.excused_weeks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (to check if their week is exempt)
CREATE POLICY "Authenticated users can read excused weeks"
ON public.excused_weeks FOR SELECT 
TO authenticated 
USING (true);

-- Only super admins can manage
CREATE POLICY "Super admins can manage excused weeks"
ON public.excused_weeks FOR ALL 
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));