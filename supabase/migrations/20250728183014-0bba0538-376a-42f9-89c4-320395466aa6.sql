-- Fix critical security issues with correct approach

-- 1. Drop the existing insecure view
DROP VIEW IF EXISTS public.v_staff_week_status;

-- 2. Recreate the view with security_invoker (this inherits RLS from underlying tables)
CREATE VIEW public.v_staff_week_status 
WITH (security_invoker = true) AS
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