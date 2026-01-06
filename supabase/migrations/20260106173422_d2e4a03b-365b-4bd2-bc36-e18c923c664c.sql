-- Enable Row Level Security on orphaned_scores_log
ALTER TABLE public.orphaned_scores_log ENABLE ROW LEVEL SECURITY;

-- Only coaches and super admins can read orphaned scores log
CREATE POLICY "Coaches and admins can read orphaned scores log"
ON public.orphaned_scores_log
FOR SELECT
USING (is_coach_or_admin(auth.uid()));

-- Only system (authenticated) can insert into orphaned scores log (for logging purposes)
CREATE POLICY "System can insert orphaned scores log"
ON public.orphaned_scores_log
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);