-- Add site_cycle_state table for cohort-based tracking
CREATE TABLE public.site_cycle_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id text NOT NULL UNIQUE,
  cycle_start_date date NOT NULL,
  cycle_length_weeks integer NOT NULL DEFAULT 6,
  timezone text NOT NULL DEFAULT 'America/Chicago',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_cycle_state ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Everyone can read site cycle state" 
ON public.site_cycle_state 
FOR SELECT 
USING (true);

CREATE POLICY "Super admins can manage site cycle state" 
ON public.site_cycle_state 
FOR ALL 
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Add onboarding columns to staff table
ALTER TABLE public.staff 
ADD COLUMN hire_date date,
ADD COLUMN onboarding_weeks integer NOT NULL DEFAULT 6;

-- Seed initial site cycle state (assuming single site for now)
INSERT INTO public.site_cycle_state (
  site_id, 
  cycle_start_date, 
  cycle_length_weeks, 
  timezone
) VALUES (
  'main', 
  '2024-01-01'::date, 
  6, 
  'America/Chicago'
);

-- Create helper function to get week in cycle
CREATE OR REPLACE FUNCTION public.get_week_in_cycle(
  cycle_start_date date,
  cycle_length_weeks integer,
  check_date date DEFAULT CURRENT_DATE
) RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT (((check_date - cycle_start_date)::integer / 7) % cycle_length_weeks) + 1;
$$;

-- Create helper function to check if staff is eligible (past onboarding)
CREATE OR REPLACE FUNCTION public.is_eligible_for_pro_moves(
  hire_date date,
  onboarding_weeks integer,
  check_date date DEFAULT CURRENT_DATE
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(hire_date, '1900-01-01'::date) + (onboarding_weeks * 7) <= check_date;
$$;