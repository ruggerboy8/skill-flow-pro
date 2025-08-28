-- Add read RLS policies for locations and organizations
-- Allow authenticated users to read locations they belong to
CREATE POLICY "read locations (auth)" ON public.locations
FOR SELECT TO authenticated
USING (true);

-- Allow authenticated users to read organizations
CREATE POLICY "read orgs (auth)" ON public.organizations
FOR SELECT TO authenticated
USING (true);

-- Allow authenticated users to read roles
CREATE POLICY "roles read (auth)" ON public.roles
FOR SELECT TO authenticated 
USING (true);