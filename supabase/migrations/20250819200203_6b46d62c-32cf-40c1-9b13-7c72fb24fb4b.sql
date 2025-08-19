-- Reset user data for testing (replace with your actual user_id)
-- First, let's find the current user's staff record
-- You'll need to replace 'your-email@example.com' with your actual email

-- Clear weekly scores for the user
DELETE FROM public.weekly_scores 
WHERE staff_id IN (
  SELECT id FROM public.staff 
  WHERE email = 'johno@reallygoodconsulting.org'
);

-- Clear weekly self-select data for the user  
DELETE FROM public.weekly_self_select
WHERE user_id IN (
  SELECT user_id FROM public.staff 
  WHERE email = 'johno@reallygoodconsulting.org'
);

-- Clear user backlog data for the user
DELETE FROM public.user_backlog
WHERE user_id IN (
  SELECT user_id FROM public.staff 
  WHERE email = 'johno@reallygoodconsulting.org'
);