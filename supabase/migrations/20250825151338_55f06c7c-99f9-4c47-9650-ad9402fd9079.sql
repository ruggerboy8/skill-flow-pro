-- Enable RLS on staging_prompts table and add policies
ALTER TABLE public.staging_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage staging prompts" 
ON public.staging_prompts 
FOR ALL 
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Read staging prompts" 
ON public.staging_prompts 
FOR SELECT 
USING (true);