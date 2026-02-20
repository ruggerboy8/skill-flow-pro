
CREATE OR REPLACE FUNCTION public.get_staff_all_weekly_scores(p_staff_id uuid)
 RETURNS TABLE(staff_id uuid, staff_name text, staff_email text, user_id uuid, role_id bigint, role_name text, location_id uuid, location_name text, organization_id uuid, organization_name text, week_of date, action_id bigint, action_statement text, domain_id bigint, domain_name text, confidence_score integer, performance_score integer, confidence_date timestamp with time zone, performance_date timestamp with time zone, confidence_late boolean, performance_late boolean, is_self_select boolean, display_order integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH staff_info AS (
    SELECT 
      s.id,
      s.name,
      s.email,
      s.user_id,
      s.role_id,
      s.primary_location_id,
      s.hire_date,
      s.participation_start_at,
      r.role_name,
      l.name AS loc_name,
      l.organization_id AS org_id,
      o.name AS org_name
    FROM staff s
    LEFT JOIN roles r ON s.role_id = r.role_id
    LEFT JOIN locations l ON s.primary_location_id = l.id
    LEFT JOIN organizations o ON l.organization_id = o.id
    WHERE s.id = p_staff_id
  ),
  -- Approach 1: Score-centric — start from actual weekly_scores, resolve assignment details
  scored_weeks AS (
    SELECT 
      si.id AS staff_id,
      si.name AS staff_name,
      si.email AS staff_email,
      si.user_id,
      si.role_id,
      si.role_name,
      si.primary_location_id AS location_id,
      si.loc_name AS location_name,
      si.org_id AS organization_id,
      si.org_name AS organization_name,
      ws.week_of,
      COALESCE(wa.action_id, wf.action_id) AS action_id,
      COALESCE(pm_wa.action_statement, pm_wf.action_statement) AS action_statement,
      COALESCE(c_wa.domain_id, c_wf.domain_id) AS domain_id,
      COALESCE(d_wa.domain_name, d_wf.domain_name) AS domain_name,
      ws.confidence_score,
      ws.performance_score,
      ws.confidence_date,
      ws.performance_date,
      ws.confidence_late,
      ws.performance_late,
      COALESCE(wa.self_select, wf.self_select, false) AS is_self_select,
      COALESCE(wa.display_order, wf.display_order, 0) AS display_order
    FROM staff_info si
    INNER JOIN weekly_scores ws ON ws.staff_id = si.id
    -- Try to resolve via weekly_assignments (assign: prefix)
    LEFT JOIN weekly_assignments wa ON ws.assignment_id = ('assign:' || wa.id::text)
    LEFT JOIN pro_moves pm_wa ON wa.action_id = pm_wa.action_id
    LEFT JOIN competencies c_wa ON pm_wa.competency_id = c_wa.competency_id
    LEFT JOIN domains d_wa ON c_wa.domain_id = d_wa.domain_id
    -- Fallback: resolve via weekly_focus
    LEFT JOIN weekly_focus wf ON ws.weekly_focus_id = wf.id::text AND ws.assignment_id IS NULL
    LEFT JOIN pro_moves pm_wf ON wf.action_id = pm_wf.action_id
    LEFT JOIN competencies c_wf ON pm_wf.competency_id = c_wf.competency_id
    LEFT JOIN domains d_wf ON c_wf.domain_id = d_wf.domain_id
    WHERE ws.week_of NOT IN (SELECT week_start_date FROM excused_weeks)
  ),
  -- Approach 2: Assignment-centric — show unscored assignment slots for weeks with no scores yet
  unscored_assignments AS (
    SELECT 
      si.id AS staff_id,
      si.name AS staff_name,
      si.email AS staff_email,
      si.user_id,
      si.role_id,
      si.role_name,
      si.primary_location_id AS location_id,
      si.loc_name AS location_name,
      si.org_id AS organization_id,
      si.org_name AS organization_name,
      wa.week_start_date AS week_of,
      wa.action_id,
      pm.action_statement,
      c.domain_id,
      d.domain_name,
      NULL::integer AS confidence_score,
      NULL::integer AS performance_score,
      NULL::timestamptz AS confidence_date,
      NULL::timestamptz AS performance_date,
      NULL::boolean AS confidence_late,
      NULL::boolean AS performance_late,
      wa.self_select AS is_self_select,
      wa.display_order
    FROM staff_info si
    INNER JOIN weekly_assignments wa ON 
      wa.role_id = si.role_id
      AND wa.status = 'locked'
      AND (
        wa.location_id = si.primary_location_id
        OR (wa.location_id IS NULL AND wa.org_id = si.org_id)
        OR (wa.org_id IS NULL AND wa.location_id IS NULL)
      )
      AND wa.week_start_date NOT IN (SELECT week_start_date FROM excused_weeks)
      AND COALESCE(si.participation_start_at::date, si.hire_date) <= (wa.week_start_date + INTERVAL '6 days')::date
      -- Exclude global when onboarding exists
      AND NOT (
        wa.source = 'global'
        AND wa.location_id IS NULL
        AND wa.org_id IS NULL
        AND EXISTS (
          SELECT 1 FROM weekly_assignments wa2
          WHERE wa2.source = 'onboarding'
            AND wa2.role_id = wa.role_id
            AND wa2.location_id = si.primary_location_id
            AND wa2.week_start_date = wa.week_start_date
            AND wa2.status = 'locked'
        )
      )
    LEFT JOIN pro_moves pm ON wa.action_id = pm.action_id
    LEFT JOIN competencies c ON pm.competency_id = c.competency_id
    LEFT JOIN domains d ON c.domain_id = d.domain_id
    -- Only include if NO score exists for this assignment
    WHERE NOT EXISTS (
      SELECT 1 FROM weekly_scores ws2
      WHERE ws2.staff_id = si.id
        AND ws2.assignment_id = ('assign:' || wa.id::text)
    )
    -- And no scores exist at all for this week (avoid duplicating scored weeks)
    AND NOT EXISTS (
      SELECT 1 FROM weekly_scores ws3
      WHERE ws3.staff_id = si.id
        AND ws3.week_of = wa.week_start_date
    )
  )
  SELECT * FROM scored_weeks
  UNION ALL
  SELECT * FROM unscored_assignments
  ORDER BY week_of DESC, display_order;
END;
$function$;
