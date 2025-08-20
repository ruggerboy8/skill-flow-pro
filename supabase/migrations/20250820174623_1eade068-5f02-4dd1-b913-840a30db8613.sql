-- Fix security warnings by setting search path for functions
CREATE OR REPLACE FUNCTION public.get_week_in_cycle(
  cycle_start_date date,
  cycle_length_weeks integer,
  check_date date DEFAULT CURRENT_DATE
) RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT (((check_date - cycle_start_date)::integer / 7) % cycle_length_weeks) + 1;
$$;

CREATE OR REPLACE FUNCTION public.is_eligible_for_pro_moves(
  hire_date date,
  onboarding_weeks integer,
  check_date date DEFAULT CURRENT_DATE
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT COALESCE(hire_date, '1900-01-01'::date) + (onboarding_weeks * 7) <= check_date;
$$;