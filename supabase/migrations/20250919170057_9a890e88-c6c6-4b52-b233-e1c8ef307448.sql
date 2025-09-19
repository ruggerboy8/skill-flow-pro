-- Fix Security Definer View issue by recreating views with proper ownership
-- This ensures views respect RLS policies instead of bypassing them

-- Drop existing views
DROP VIEW IF EXISTS public.view_evaluation_items_enriched;
DROP VIEW IF EXISTS public.view_weekly_scores_with_competency;

-- Recreate view_evaluation_items_enriched with security invoker (respects caller's permissions)
CREATE VIEW public.view_evaluation_items_enriched 
WITH (security_invoker = true) AS
SELECT 
    e.id AS evaluation_id,
    e.type AS evaluation_type,
    e.quarter,
    e.program_year,
    e.created_at AS evaluation_at,
    subj.id AS staff_id,
    subj.name AS staff_name,
    subj.role_id,
    subj.primary_location_id,
    COALESCE(loc.name, 'Unknown Location'::text) AS location_name,
    loc.organization_id,
    ei.competency_id,
    c.domain_id,
    COALESCE(d.domain_name, 'Unassigned'::text) AS domain_name,
    ei.observer_score,
    ei.self_score
FROM evaluation_items ei
JOIN evaluations e ON e.id = ei.evaluation_id
JOIN staff subj ON subj.id = e.staff_id
LEFT JOIN locations loc ON loc.id = subj.primary_location_id
LEFT JOIN competencies c ON c.competency_id = ei.competency_id
LEFT JOIN domains d ON d.domain_id = c.domain_id;

-- Recreate view_weekly_scores_with_competency with security invoker
CREATE VIEW public.view_weekly_scores_with_competency 
WITH (security_invoker = true) AS
SELECT 
    ws.id AS weekly_score_id,
    ws.staff_id,
    s.role_id,
    s.primary_location_id,
    loc.organization_id,
    ws.weekly_focus_id,
    COALESCE(ws.selected_action_id, wf.action_id) AS action_id,
    pm.competency_id,
    c.domain_id,
    COALESCE(d.domain_name, 'Unassigned'::text) AS domain_name,
    ws.confidence_score,
    ws.performance_score,
    ws.created_at
FROM weekly_scores ws
JOIN staff s ON s.id = ws.staff_id
LEFT JOIN locations loc ON loc.id = s.primary_location_id
JOIN weekly_focus wf ON wf.id = ws.weekly_focus_id
LEFT JOIN pro_moves pm ON pm.action_id = COALESCE(ws.selected_action_id, wf.action_id)
LEFT JOIN competencies c ON c.competency_id = pm.competency_id
LEFT JOIN domains d ON d.domain_id = c.domain_id
WHERE pm.competency_id IS NOT NULL;

-- Grant appropriate permissions
GRANT SELECT ON public.view_evaluation_items_enriched TO authenticated;
GRANT SELECT ON public.view_weekly_scores_with_competency TO authenticated;