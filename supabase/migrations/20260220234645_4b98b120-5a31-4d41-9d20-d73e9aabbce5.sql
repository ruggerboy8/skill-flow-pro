
-- Fix security definer warning by setting security_invoker on the view
ALTER VIEW view_staff_submission_windows SET (security_invoker = on);
