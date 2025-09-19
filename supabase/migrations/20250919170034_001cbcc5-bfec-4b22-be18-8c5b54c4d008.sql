-- Fix Security Definer View issue by changing ownership and ensuring RLS is respected

-- Change ownership of views from postgres to authenticator role
-- This ensures views respect RLS policies instead of bypassing them
ALTER VIEW public.view_evaluation_items_enriched OWNER TO authenticator;
ALTER VIEW public.view_weekly_scores_with_competency OWNER TO authenticator;

-- Enable RLS on the views themselves for additional security
ALTER VIEW public.view_evaluation_items_enriched ENABLE ROW LEVEL SECURITY;
ALTER VIEW public.view_weekly_scores_with_competency ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for the views that mirror the underlying table policies
-- For view_evaluation_items_enriched - allow coaches/admins and own evaluations
CREATE POLICY "view_evaluation_items_enriched_policy" ON public.view_evaluation_items_enriched
FOR SELECT USING (
  -- Coaches and super admins can see all
  is_coach_or_admin(auth.uid())
  OR 
  -- Staff can see their own submitted evaluations
  (staff_id = (SELECT id FROM staff WHERE user_id = auth.uid()))
);

-- For view_weekly_scores_with_competency - allow coaches/admins and own scores
CREATE POLICY "view_weekly_scores_with_competency_policy" ON public.view_weekly_scores_with_competency  
FOR SELECT USING (
  -- Coaches and super admins can see all
  is_coach_or_admin(auth.uid())
  OR
  -- Staff can see their own scores
  (staff_id = (SELECT id FROM staff WHERE user_id = auth.uid()))
);