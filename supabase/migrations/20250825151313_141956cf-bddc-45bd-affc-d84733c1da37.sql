-- Enable RLS on user_backlog_v2 table and add policies
ALTER TABLE public.user_backlog_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own backlog v2" 
ON public.user_backlog_v2 
FOR SELECT 
USING (staff_id = (SELECT id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert their own backlog v2" 
ON public.user_backlog_v2 
FOR INSERT 
WITH CHECK (staff_id = (SELECT id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "Users can update their own backlog v2" 
ON public.user_backlog_v2 
FOR UPDATE 
USING (staff_id = (SELECT id FROM public.staff WHERE user_id = auth.uid()));

CREATE POLICY "Coaches can view all backlogs v2" 
ON public.user_backlog_v2 
FOR SELECT 
USING (is_coach_or_admin(auth.uid()));

CREATE POLICY "System functions can manage backlog v2"
ON public.user_backlog_v2
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);