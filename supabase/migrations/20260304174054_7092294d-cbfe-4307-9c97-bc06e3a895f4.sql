ALTER TABLE public.staff 
ADD COLUMN baseline_released_at timestamptz DEFAULT NULL,
ADD COLUMN baseline_released_by uuid DEFAULT NULL REFERENCES auth.users(id);