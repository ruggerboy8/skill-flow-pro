-- Drop the policy that depends on the view
DROP POLICY IF EXISTS "Coaches can read all scores" ON public.weekly_scores;

-- Drop and recreate the view
DROP VIEW IF EXISTS public.v_admins;

-- Create helper view for admin permissions (without security definer)  
CREATE VIEW public.v_admins AS
SELECT user_id,
       BOOL_OR(is_super_admin) AS super_admin,
       BOOL_OR(is_super_admin OR is_coach) AS coach
FROM staff
GROUP BY user_id;

-- Create RLS policy for coaches to read all weekly scores using direct staff table lookup
CREATE POLICY "Coaches can read all scores" 
ON public.weekly_scores 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.staff 
    WHERE user_id = auth.uid() AND (is_coach = true OR is_super_admin = true)
  )
);