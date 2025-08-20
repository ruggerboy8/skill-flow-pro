-- Remove dependent views first, then ISO week columns, then recreate views without ISO dependency
-- The ISO week columns were causing confusion by mixing calendar-based and progress-based concepts

-- Drop dependent views first
DROP VIEW IF EXISTS public.v_staff_week_status;
DROP VIEW IF EXISTS public.v_weekly_focus;

-- Remove ISO week columns from weekly_focus table since we're using cycle/week_in_cycle instead
ALTER TABLE public.weekly_focus DROP COLUMN IF EXISTS iso_year;
ALTER TABLE public.weekly_focus DROP COLUMN IF EXISTS iso_week;

-- Add unique constraint to prevent duplicate weekly focus per role/cycle/week
ALTER TABLE public.weekly_focus 
DROP CONSTRAINT IF EXISTS unique_role_cycle_week_display;

ALTER TABLE public.weekly_focus 
ADD CONSTRAINT unique_role_cycle_week_display 
UNIQUE (role_id, cycle, week_in_cycle, display_order);

-- Add check constraint to ensure valid cycle and week values
ALTER TABLE public.weekly_focus 
DROP CONSTRAINT IF EXISTS valid_cycle;

ALTER TABLE public.weekly_focus 
DROP CONSTRAINT IF EXISTS valid_week_in_cycle;

ALTER TABLE public.weekly_focus 
ADD CONSTRAINT valid_cycle CHECK (cycle >= 1 AND cycle <= 10);

ALTER TABLE public.weekly_focus 
ADD CONSTRAINT valid_week_in_cycle CHECK (week_in_cycle >= 1 AND week_in_cycle <= 12);

-- Recreate the views without ISO week dependencies if they're still needed
-- (Note: These may no longer be needed with the new progress-based system)