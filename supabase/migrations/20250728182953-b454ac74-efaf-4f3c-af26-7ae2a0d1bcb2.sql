-- Fix critical security issues

-- 1. Drop the existing insecure view
DROP VIEW IF EXISTS public.v_staff_week_status;

-- 2. Recreate the view without SECURITY DEFINER (uses SECURITY INVOKER by default)
CREATE VIEW public.v_staff_week_status AS
SELECT 
    s.id as staff_id,
    s.role_id,
    wf.id as weekly_focus_id,
    wf.iso_year,
    wf.iso_week,
    ws.confidence_score,
    ws.performance_score
FROM staff s
LEFT JOIN weekly_focus wf ON s.role_id = wf.role_id
LEFT JOIN weekly_scores ws ON wf.id = ws.weekly_focus_id AND s.id = ws.staff_id;

-- 3. Enable RLS on the view
ALTER VIEW public.v_staff_week_status SET (security_invoker = true);

-- 4. Add RLS policy for the view to restrict access to user's own data
CREATE POLICY "Users can view their own week status" 
ON public.v_staff_week_status 
FOR SELECT 
USING (
    staff_id IN (
        SELECT id FROM staff WHERE user_id = auth.uid()
    )
);

-- 5. Configure authentication security settings
-- Set OTP expiry to 15 minutes (900 seconds) instead of default 1 hour
UPDATE auth.config 
SET 
    mailer_otp_exp = 900,
    password_min_length = 8,
    enable_signup = true
WHERE true;

-- 6. Enable leaked password protection (if the column exists)
-- This may need to be done through Supabase dashboard if not available via SQL