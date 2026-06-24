CREATE OR REPLACE FUNCTION public.get_staff_weekly_scores(p_coach_user_id uuid, p_week_of text DEFAULT NULL::text)
RETURNS TABLE(
  staff_id uuid,
  staff_name text,
  staff_email text,
  user_id uuid,
  role_id bigint,
  role_name text,
  location_id uuid,
  location_name text,
  group_id uuid,
  group_name text,
  score_id uuid,
  week_of date,
  assignment_id text,
  action_id bigint,
  selected_action_id bigint,
  confidence_score integer,
  confidence_date timestamp with time zone,
  confidence_late boolean,
  confidence_source score_source,
  performance_score integer,
  performance_date timestamp with time zone,
  performance_late boolean,
  performance_source score_source,
  action_statement text,
  domain_id bigint,
  domain_name text,
  display_order integer,
  self_select boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coach_staff_id uuid;
  v_coach_scope_type text;
  v_coach_scope_id uuid;
  v_is_super_admin boolean;
  v_is_org_admin boolean;
  v_has_org_team_access boolean;
  v_org_id uuid;
  v_most_recent_week date;
BEGIN
  SELECT
    s.id,
    s.coach_scope_type,
    s.coach_scope_id,
    (COALESCE(s.is_super_admin, false) OR COALESCE(uc.is_platform_admin, false)),
    (COALESCE(s.is_org_admin, false) OR COALESCE(uc.is_org_admin, false)),
    (
      COALESCE(s.is_org_admin, false)
      OR COALESCE(uc.is_org_admin, false)
      OR COALESCE(uc.can_view_submissions, false)
      OR COALESCE(uc.can_manage_users, false)
      OR COALESCE(uc.can_manage_locations, false)
      OR COALESCE(uc.can_invite_users, false)
      OR COALESCE(uc.can_review_evals, false)
      OR COALESCE(uc.can_manage_assignments, false)
      OR COALESCE(uc.can_manage_library, false)
    ),
    COALESCE(
      s.organization_id,
      pg.organization_id
    )
  INTO
    v_coach_staff_id,
    v_coach_scope_type,
    v_coach_scope_id,
    v_is_super_admin,
    v_is_org_admin,
    v_has_org_team_access,
    v_org_id
  FROM public.staff s
  LEFT JOIN public.user_capabilities uc ON uc.staff_id = s.id
  LEFT JOIN public.locations l ON l.id = s.primary_location_id
  LEFT JOIN public.practice_groups pg ON pg.id = l.group_id
  WHERE s.user_id = p_coach_user_id
    AND (
      s.is_coach
      OR s.is_super_admin
      OR s.is_org_admin
      OR s.is_office_manager
      OR COALESCE(uc.is_platform_admin, false)
      OR COALESCE(uc.is_org_admin, false)
      OR COALESCE(uc.can_view_submissions, false)
      OR COALESCE(uc.can_manage_users, false)
      OR COALESCE(uc.can_manage_locations, false)
      OR COALESCE(uc.can_invite_users, false)
      OR COALESCE(uc.can_review_evals, false)
      OR COALESCE(uc.can_manage_assignments, false)
      OR COALESCE(uc.can_manage_library, false)
    )
  LIMIT 1;

  IF v_coach_staff_id IS NULL THEN
    RETURN;
  END IF;

  IF p_week_of IS NOT NULL THEN
    v_most_recent_week := date_trunc('week', p_week_of::date)::date;
  ELSE
    SELECT MAX((ws.week_of::date - ((EXTRACT(DOW FROM ws.week_of)::int + 6) % 7))::date)
    INTO v_most_recent_week
    FROM public.weekly_scores ws;
  END IF;

  RETURN QUERY
  WITH coach_scopes_expanded AS (
    SELECT cs.scope_type, cs.scope_id
    FROM public.coach_scopes cs
    WHERE cs.staff_id = v_coach_staff_id
    UNION
    SELECT v_coach_scope_type, v_coach_scope_id
    WHERE v_coach_scope_type IS NOT NULL AND v_coach_scope_id IS NOT NULL
  ),
  filtered_staff AS (
    SELECT
      s.id,
      s.name,
      s.email,
      s.user_id,
      s.role_id,
      r.role_name,
      l.id AS location_id,
      l.name AS location_name,
      o.id AS group_id,
      o.name AS group_name
    FROM public.staff s
    INNER JOIN public.locations l ON l.id = s.primary_location_id
    INNER JOIN public.practice_groups o ON o.id = l.group_id
    LEFT JOIN public.roles r ON r.role_id = s.role_id
    WHERE s.is_participant = true
      AND s.is_org_admin = false
      AND s.is_paused = false
      AND s.primary_location_id IS NOT NULL
      AND (
        v_is_super_admin = true
        OR (v_has_org_team_access = true AND v_org_id IS NOT NULL AND COALESCE(s.organization_id, o.organization_id) = v_org_id)
        OR EXISTS (
          SELECT 1 FROM coach_scopes_expanded cse
          WHERE (cse.scope_type = 'org' AND o.id = cse.scope_id)
             OR (cse.scope_type = 'location' AND l.id = cse.scope_id)
        )
      )
  )
  SELECT
    fs.id AS staff_id,
    fs.name AS staff_name,
    fs.email AS staff_email,
    fs.user_id,
    fs.role_id::bigint,
    fs.role_name,
    fs.location_id,
    fs.location_name,
    fs.group_id,
    fs.group_name,
    ws.id AS score_id,
    (ws.week_of::date - ((EXTRACT(DOW FROM ws.week_of)::int + 6) % 7))::date AS week_of,
    ws.assignment_id,
    wa.action_id::bigint,
    ws.selected_action_id::bigint,
    ws.confidence_score,
    ws.confidence_date,
    ws.confidence_late,
    ws.confidence_source,
    ws.performance_score,
    ws.performance_date,
    ws.performance_late,
    ws.performance_source,
    COALESCE(pm.action_statement, opm.action_statement, pm_sel.action_statement, 'Self-Select') AS action_statement,
    COALESCE(c.domain_id, c_sel.domain_id)::bigint AS domain_id,
    COALESCE(d.domain_name, d_sel.domain_name) AS domain_name,
    wa.display_order,
    wa.self_select
  FROM filtered_staff fs
  LEFT JOIN public.weekly_scores ws ON ws.staff_id = fs.id
    AND (ws.week_of::date - ((EXTRACT(DOW FROM ws.week_of)::int + 6) % 7))::date = v_most_recent_week
  LEFT JOIN public.weekly_assignments wa ON wa.id::text = REPLACE(ws.assignment_id, 'assign:', '')
  LEFT JOIN public.pro_moves pm ON pm.action_id = wa.action_id
  LEFT JOIN public.organization_pro_moves opm ON opm.id = wa.org_move_id
  LEFT JOIN public.pro_moves pm_sel ON pm_sel.action_id = ws.selected_action_id
  LEFT JOIN public.competencies c ON c.competency_id = COALESCE(pm.competency_id, opm.competency_id, wa.competency_id)
  LEFT JOIN public.competencies c_sel ON c_sel.competency_id = pm_sel.competency_id
  LEFT JOIN public.domains d ON d.domain_id = c.domain_id
  LEFT JOIN public.domains d_sel ON d_sel.domain_id = c_sel.domain_id
  ORDER BY
    fs.name,
    ws.week_of DESC NULLS LAST,
    ws.performance_date DESC NULLS LAST,
    ws.confidence_date DESC NULLS LAST;
END;
$function$;