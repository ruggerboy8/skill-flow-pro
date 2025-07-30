-- Add coach and admin flags to staff table
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS is_coach boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location text;

-- Create helper view for admin permissions
CREATE OR REPLACE VIEW public.v_admins AS
SELECT user_id,
       BOOL_OR(is_super_admin) AS super_admin,
       BOOL_OR(is_super_admin OR is_coach) AS coach
FROM staff
GROUP BY user_id;

-- Create RLS policy for coaches to read all weekly scores
CREATE POLICY "Coaches can read all scores" 
ON public.weekly_scores 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.v_admins 
    WHERE user_id = auth.uid() AND coach = true
  )
);