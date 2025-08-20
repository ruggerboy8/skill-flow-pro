-- Remove unnecessary ISO week columns and add proper constraints for progress-based tracking
-- The ISO week columns were causing confusion by mixing calendar-based and progress-based concepts

-- Remove ISO week columns from weekly_focus table since we're using cycle/week_in_cycle instead
ALTER TABLE public.weekly_focus DROP COLUMN IF EXISTS iso_year;
ALTER TABLE public.weekly_focus DROP COLUMN IF EXISTS iso_week;

-- Add unique constraint to prevent duplicate weekly focus per role/cycle/week
ALTER TABLE public.weekly_focus 
ADD CONSTRAINT unique_role_cycle_week_display 
UNIQUE (role_id, cycle, week_in_cycle, display_order);

-- Add check constraint to ensure valid cycle and week values
ALTER TABLE public.weekly_focus 
ADD CONSTRAINT valid_cycle CHECK (cycle >= 1 AND cycle <= 10);

ALTER TABLE public.weekly_focus 
ADD CONSTRAINT valid_week_in_cycle CHECK (week_in_cycle >= 1 AND week_in_cycle <= 12);