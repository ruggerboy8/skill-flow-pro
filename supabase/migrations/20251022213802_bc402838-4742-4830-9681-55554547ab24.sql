-- Update Ariyana's roles_updated_at timestamp to trigger automatic refresh
UPDATE public.staff 
SET roles_updated_at = now() 
WHERE id = '38d4458c-cc01-402a-bf59-d7530f39c0ec';