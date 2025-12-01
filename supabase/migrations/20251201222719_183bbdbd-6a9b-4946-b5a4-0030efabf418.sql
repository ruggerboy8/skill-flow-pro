-- Phase 3.1 & 3.2: Fix RPCs to exclude global assignments for onboarding staff
-- This prevents "Missing" status when onboarding scores are complete

-- Drop and recreate get_staff_all_weekly_scores with onboarding filter
DROP FUNCTION IF EXISTS get_staff_all_weekly_scores(uuid);

CREATE OR REPLACE FUNCTION get_staff_all_weekly_scores(p_staff_id uuid)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  staff_email text,
  user_id uuid,
  role_id bigint,
  role_name text,
  location_id uuid,
  location_name text,
  organization_id uuid,
  organization_name text,
  score_id uuid,
  week_of date,
  assignment_id text,
  action_id bigint,
  selected_action_id bigint,
  confidence_score integer,
  confidence_date timestamptz,
  confidence_late boolean,
  confidence_source text,
  performance_score integer,
  performance_date timestamptz,
  performance_late boolean,
  performance_source text,
  action_statement text,
  domain_id bigint,
  domain_name text,
  display_order integer,
  self_select boolean
) AS $$
BEGIN
  RETURN QUERY
  WITH staff_info AS (
    SELECT
      s.id,
      s.name,
      s.email,
      s.user_id,
      s.role_id,
      r.role_name,
      s.primary_location_id,
      l.name as loc_name,
      l.organization_id as org_id,
      o.name as org_name
    FROM staff s
    LEFT JOIN roles r ON r.role_id = s.role_id
    LEFT JOIN locations l ON l.id = s.primary_location_id
    LEFT JOIN organizations o ON o.id = l.organization_id
    WHERE s.id = p_staff_id
  ),
  assignment_scores AS (
    SELECT
      wa.id as assignment_id,
      wa.week_start_date,
      wa.action_id,
      wa.competency_id,
      wa.display_order,
      wa.self_select,
      wa.source,
      pm.action_statement,
      c.domain_id,
      d.domain_name,
      si.id as staff_id,
      si.name as staff_name,
      si.email as staff_email,
      si.user_id,
      si.role_id,
      si.role_name,
      si.primary_location_id as location_id,
      si.loc_name as location_name,
      si.org_id as organization_id,
      si.org_name as organization_name,
      ws.id as score_id,
      ws.selected_action_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_late,
      ws.confidence_source::text,
      ws.performance_score,
      ws.performance_date,
      ws.performance_late,
      ws.performance_source::text
    FROM weekly_assignments wa
    CROSS JOIN staff_info si
    LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
    LEFT JOIN competencies c ON c.competency_id = wa.competency_id
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    LEFT JOIN weekly_scores ws ON (
      ws.assignment_id = 'assign:' || wa.id::text
      AND ws.staff_id = si.id
    )
    WHERE wa.role_id = si.role_id
      AND wa.status = 'locked'
      AND (
        -- Onboarding assignments for staff's location
        (wa.source = 'onboarding' AND wa.location_id = si.primary_location_id)
        
        -- Global assignments for staff's org (if no org_id, it's truly global)
        OR (wa.source = 'global' AND (wa.org_id = si.org_id OR wa.org_id IS NULL))
      )
      -- CRITICAL FIX: Exclude global assignments when onboarding exists for same week
      AND NOT (
        wa.source = 'global'
        AND EXISTS (
          SELECT 1 FROM weekly_assignments wa2
          WHERE wa2.source = 'onboarding'
            AND wa2.role_id = wa.role_id
            AND wa2.location_id = si.primary_location_id
            AND wa2.week_start_date = wa.week_start_date
            AND wa2.status = 'locked'
        )
      )
  ),
  focus_scores AS (
    SELECT
      wf.id as focus_id,
      wf.week_start_date,
      wf.action_id,
      wf.competency_id,
      wf.display_order,
      wf.self_select,
      'legacy'::text as source,
      pm.action_statement,
      c.domain_id,
      d.domain_name,
      si.id as staff_id,
      si.name as staff_name,
      si.email as staff_email,
      si.user_id,
      si.role_id,
      si.role_name,
      si.primary_location_id as location_id,
      si.loc_name as location_name,
      si.org_id as organization_id,
      si.org_name as organization_name,
      ws.id as score_id,
      ws.selected_action_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_late,
      ws.confidence_source::text,
      ws.performance_score,
      ws.performance_date,
      ws.performance_late,
      ws.performance_source::text
    FROM weekly_focus wf
    CROSS JOIN staff_info si
    LEFT JOIN pro_moves pm ON pm.action_id = wf.action_id
    LEFT JOIN competencies c ON c.competency_id = wf.competency_id
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    LEFT JOIN weekly_scores ws ON (
      ws.weekly_focus_id = wf.id::text
      AND ws.staff_id = si.id
    )
    WHERE wf.role_id = si.role_id
      AND wf.week_start_date IS NOT NULL
  )
  SELECT
    COALESCE(a.staff_id, f.staff_id) as staff_id,
    COALESCE(a.staff_name, f.staff_name) as staff_name,
    COALESCE(a.staff_email, f.staff_email) as staff_email,
    COALESCE(a.user_id, f.user_id) as user_id,
    COALESCE(a.role_id, f.role_id) as role_id,
    COALESCE(a.role_name, f.role_name) as role_name,
    COALESCE(a.location_id, f.location_id) as location_id,
    COALESCE(a.location_name, f.location_name) as location_name,
    COALESCE(a.organization_id, f.organization_id) as organization_id,
    COALESCE(a.organization_name, f.organization_name) as organization_name,
    COALESCE(a.score_id, f.score_id) as score_id,
    COALESCE(a.week_start_date, f.week_start_date) as week_of,
    COALESCE('assign:' || a.assignment_id::text, f.focus_id::text) as assignment_id,
    COALESCE(a.action_id, f.action_id) as action_id,
    COALESCE(a.selected_action_id, f.selected_action_id) as selected_action_id,
    COALESCE(a.confidence_score, f.confidence_score) as confidence_score,
    COALESCE(a.confidence_date, f.confidence_date) as confidence_date,
    COALESCE(a.confidence_late, f.confidence_late) as confidence_late,
    COALESCE(a.confidence_source, f.confidence_source) as confidence_source,
    COALESCE(a.performance_score, f.performance_score) as performance_score,
    COALESCE(a.performance_date, f.performance_date) as performance_date,
    COALESCE(a.performance_late, f.performance_late) as performance_late,
    COALESCE(a.performance_source, f.performance_source) as performance_source,
    COALESCE(a.action_statement, f.action_statement) as action_statement,
    COALESCE(a.domain_id, f.domain_id) as domain_id,
    COALESCE(a.domain_name, f.domain_name) as domain_name,
    COALESCE(a.display_order, f.display_order) as display_order,
    COALESCE(a.self_select, f.self_select) as self_select
  FROM assignment_scores a
  FULL OUTER JOIN focus_scores f ON (
    a.staff_id = f.staff_id
    AND a.week_start_date = f.week_start_date
    AND a.action_id = f.action_id
  )
  ORDER BY week_of DESC NULLS LAST, display_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate get_my_weekly_scores with onboarding filter
DROP FUNCTION IF EXISTS get_my_weekly_scores(date);

CREATE OR REPLACE FUNCTION get_my_weekly_scores(p_week_of date DEFAULT NULL)
RETURNS TABLE (
  staff_id uuid,
  staff_name text,
  staff_email text,
  user_id uuid,
  role_id bigint,
  role_name text,
  location_id uuid,
  location_name text,
  organization_id uuid,
  organization_name text,
  score_id uuid,
  week_of date,
  assignment_id text,
  action_id bigint,
  selected_action_id bigint,
  confidence_score integer,
  confidence_date timestamptz,
  confidence_late boolean,
  confidence_source text,
  performance_score integer,
  performance_date timestamptz,
  performance_late boolean,
  performance_source text,
  action_statement text,
  domain_id bigint,
  domain_name text,
  display_order integer,
  self_select boolean
) AS $$
BEGIN
  RETURN QUERY
  WITH staff_info AS (
    SELECT
      s.id,
      s.name,
      s.email,
      s.user_id,
      s.role_id,
      r.role_name,
      s.primary_location_id,
      l.name as loc_name,
      l.organization_id as org_id,
      o.name as org_name
    FROM staff s
    LEFT JOIN roles r ON r.role_id = s.role_id
    LEFT JOIN locations l ON l.id = s.primary_location_id
    LEFT JOIN organizations o ON o.id = l.organization_id
    WHERE s.user_id = auth.uid()
  ),
  assignment_scores AS (
    SELECT
      wa.id as assignment_id,
      wa.week_start_date,
      wa.action_id,
      wa.competency_id,
      wa.display_order,
      wa.self_select,
      wa.source,
      pm.action_statement,
      c.domain_id,
      d.domain_name,
      si.id as staff_id,
      si.name as staff_name,
      si.email as staff_email,
      si.user_id,
      si.role_id,
      si.role_name,
      si.primary_location_id as location_id,
      si.loc_name as location_name,
      si.org_id as organization_id,
      si.org_name as organization_name,
      ws.id as score_id,
      ws.selected_action_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_late,
      ws.confidence_source::text,
      ws.performance_score,
      ws.performance_date,
      ws.performance_late,
      ws.performance_source::text
    FROM weekly_assignments wa
    CROSS JOIN staff_info si
    LEFT JOIN pro_moves pm ON pm.action_id = wa.action_id
    LEFT JOIN competencies c ON c.competency_id = wa.competency_id
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    LEFT JOIN weekly_scores ws ON (
      ws.assignment_id = 'assign:' || wa.id::text
      AND ws.staff_id = si.id
    )
    WHERE wa.role_id = si.role_id
      AND wa.status = 'locked'
      AND (p_week_of IS NULL OR wa.week_start_date = p_week_of)
      AND (
        -- Onboarding assignments for user's location
        (wa.source = 'onboarding' AND wa.location_id = si.primary_location_id)
        
        -- Global assignments for user's org (if no org_id, it's truly global)
        OR (wa.source = 'global' AND (wa.org_id = si.org_id OR wa.org_id IS NULL))
      )
      -- CRITICAL FIX: Exclude global assignments when onboarding exists for same week
      AND NOT (
        wa.source = 'global'
        AND EXISTS (
          SELECT 1 FROM weekly_assignments wa2
          WHERE wa2.source = 'onboarding'
            AND wa2.role_id = wa.role_id
            AND wa2.location_id = si.primary_location_id
            AND wa2.week_start_date = wa.week_start_date
            AND wa2.status = 'locked'
        )
      )
  ),
  focus_scores AS (
    SELECT
      wf.id as focus_id,
      wf.week_start_date,
      wf.action_id,
      wf.competency_id,
      wf.display_order,
      wf.self_select,
      'legacy'::text as source,
      pm.action_statement,
      c.domain_id,
      d.domain_name,
      si.id as staff_id,
      si.name as staff_name,
      si.email as staff_email,
      si.user_id,
      si.role_id,
      si.role_name,
      si.primary_location_id as location_id,
      si.loc_name as location_name,
      si.org_id as organization_id,
      si.org_name as organization_name,
      ws.id as score_id,
      ws.selected_action_id,
      ws.confidence_score,
      ws.confidence_date,
      ws.confidence_late,
      ws.confidence_source::text,
      ws.performance_score,
      ws.performance_date,
      ws.performance_late,
      ws.performance_source::text
    FROM weekly_focus wf
    CROSS JOIN staff_info si
    LEFT JOIN pro_moves pm ON pm.action_id = wf.action_id
    LEFT JOIN competencies c ON c.competency_id = wf.competency_id
    LEFT JOIN domains d ON d.domain_id = c.domain_id
    LEFT JOIN weekly_scores ws ON (
      ws.weekly_focus_id = wf.id::text
      AND ws.staff_id = si.id
    )
    WHERE wf.role_id = si.role_id
      AND wf.week_start_date IS NOT NULL
      AND (p_week_of IS NULL OR wf.week_start_date = p_week_of)
  )
  SELECT
    COALESCE(a.staff_id, f.staff_id) as staff_id,
    COALESCE(a.staff_name, f.staff_name) as staff_name,
    COALESCE(a.staff_email, f.staff_email) as staff_email,
    COALESCE(a.user_id, f.user_id) as user_id,
    COALESCE(a.role_id, f.role_id) as role_id,
    COALESCE(a.role_name, f.role_name) as role_name,
    COALESCE(a.location_id, f.location_id) as location_id,
    COALESCE(a.location_name, f.location_name) as location_name,
    COALESCE(a.organization_id, f.organization_id) as organization_id,
    COALESCE(a.organization_name, f.organization_name) as organization_name,
    COALESCE(a.score_id, f.score_id) as score_id,
    COALESCE(a.week_start_date, f.week_start_date) as week_of,
    COALESCE('assign:' || a.assignment_id::text, f.focus_id::text) as assignment_id,
    COALESCE(a.action_id, f.action_id) as action_id,
    COALESCE(a.selected_action_id, f.selected_action_id) as selected_action_id,
    COALESCE(a.confidence_score, f.confidence_score) as confidence_score,
    COALESCE(a.confidence_date, f.confidence_date) as confidence_date,
    COALESCE(a.confidence_late, f.confidence_late) as confidence_late,
    COALESCE(a.confidence_source, f.confidence_source) as confidence_source,
    COALESCE(a.performance_score, f.performance_score) as performance_score,
    COALESCE(a.performance_date, f.performance_date) as performance_date,
    COALESCE(a.performance_late, f.performance_late) as performance_late,
    COALESCE(a.performance_source, f.performance_source) as performance_source,
    COALESCE(a.action_statement, f.action_statement) as action_statement,
    COALESCE(a.domain_id, f.domain_id) as domain_id,
    COALESCE(a.domain_name, f.domain_name) as domain_name,
    COALESCE(a.display_order, f.display_order) as display_order,
    COALESCE(a.self_select, f.self_select) as self_select
  FROM assignment_scores a
  FULL OUTER JOIN focus_scores f ON (
    a.staff_id = f.staff_id
    AND a.week_start_date = f.week_start_date
    AND a.action_id = f.action_id
  )
  ORDER BY week_of DESC NULLS LAST, display_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;