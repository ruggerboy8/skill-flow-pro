-- Fix coach panel: exclude super admins and non-participant coaches, fix week alignment
DROP FUNCTION IF EXISTS public.get_staff_statuses(uuid, timestamptz);

CREATE OR REPLACE FUNCTION public.get_staff_statuses(
  p_coach_user_id uuid,
  p_now timestamptz DEFAULT NOW()
)
RETURNS TABLE(
  staff_id uuid,
  staff_name text,
  role_id bigint,
  role_name text,
  location_id uuid,
  location_name text,
  organization_name text,
  cycle_number int,
  week_in_cycle int,
  week_label text,
  status_state text,
  status_label text,
  status_severity text,
  status_detail text,
  deadline_at timestamptz,
  last_activity_at timestamptz,
  last_activity_kind text,
  last_activity_text text,
  backlog_count int,
  onboarding_weeks_left int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_super_admin boolean;
  coach_org_id uuid;
  coach_loc_id uuid;
  coach_scope_type text;
BEGIN
  -- Check if requester is super admin
  SELECT s.is_super_admin INTO v_is_super_admin
  FROM staff s WHERE s.user_id = p_coach_user_id;

  IF NOT COALESCE(v_is_super_admin, false) THEN
    -- Get coach's scope
    SELECT s.coach_scope_type, s.coach_scope_id INTO coach_scope_type, coach_loc_id
    FROM staff s WHERE s.user_id = p_coach_user_id;

    IF coach_scope_type = 'organization' THEN
      coach_org_id := coach_loc_id;
      coach_loc_id := NULL;
    ELSIF coach_scope_type = 'location' THEN
      SELECT l.organization_id INTO coach_org_id
      FROM locations l WHERE l.id = coach_loc_id;
    END IF;
  END IF;

  RETURN QUERY
  WITH visible_staff AS (
    SELECT
      s.id,
      s.name,
      s.role_id,
      r.role_name,
      s.primary_location_id,
      l.name AS location_name,
      o.name AS organization_name,
      l.timezone,
      l.program_start_date,
      l.cycle_length_weeks,
      s.hire_date,
      s.onboarding_weeks,
      s.participation_start_at
    FROM staff s
    JOIN roles r ON r.role_id = s.role_id
    LEFT JOIN locations l ON l.id = s.primary_location_id
    LEFT JOIN organizations o ON o.id = l.organization_id
    WHERE s.is_participant = true
      AND s.is_super_admin = false  -- FILTER: Exclude super admins
      AND NOT (s.is_coach = true AND s.is_participant = false)  -- FILTER: Exclude non-participant coaches
      AND (COALESCE(v_is_super_admin, false) OR coach_org_id IS NULL OR l.organization_id = coach_org_id)
      AND (coach_loc_id IS NULL OR s.primary_location_id = coach_loc_id)
  ),
  cycle_calc AS (
    SELECT
      vs.*,
      (p_now AT TIME ZONE vs.timezone) AS local_now,
      ((p_now AT TIME ZONE vs.timezone)::date
        - ((EXTRACT(dow FROM (p_now AT TIME ZONE vs.timezone))::int + 6) % 7))::date AS monday_date,
      (vs.program_start_date
        - ((EXTRACT(dow FROM vs.program_start_date)::int + 6) % 7))::date AS program_monday,
      -- Calculate deadline: Friday 5pm local
      (((p_now AT TIME ZONE vs.timezone)::date
        - ((EXTRACT(dow FROM (p_now AT TIME ZONE vs.timezone))::int + 6) % 7))::date
        + INTERVAL '4 days' + TIME '17:00') AT TIME ZONE vs.timezone AS performance_deadline
    FROM visible_staff vs
  ),
  cycle_info AS (
    SELECT
      cc.*,
      -- Check if before Friday 5pm deadline
      (p_now < cc.performance_deadline) AS before_deadline,
      GREATEST(0, (cc.monday_date - cc.program_monday))::int AS days_diff,
      FLOOR(GREATEST(0, (cc.monday_date - cc.program_monday))::int / 7.0)::int AS raw_week_index
    FROM cycle_calc cc
  ),
  adjusted_week AS (
    SELECT
      ci.*,
      -- If before Friday 5pm and past week 0, use previous week
      CASE 
        WHEN ci.before_deadline AND ci.raw_week_index > 0
        THEN ci.raw_week_index - 1
        ELSE ci.raw_week_index
      END AS week_index,
      -- Adjusted Monday for assignment lookup
      CASE 
        WHEN ci.before_deadline AND ci.raw_week_index > 0
        THEN (ci.monday_date - INTERVAL '1 week')::date
        ELSE ci.monday_date
      END AS assignment_monday
    FROM cycle_info ci
  ),
  cycle_final AS (
    SELECT
      aw.*,
      GREATEST(1, (aw.week_index / aw.cycle_length_weeks + 1))::int AS cycle_number,
      GREATEST(1, ((aw.week_index % aw.cycle_length_weeks) + 1))::int AS week_in_cycle
    FROM adjusted_week aw
  ),
  assignments AS (
    SELECT
      cf.*,
      COALESCE(
        (SELECT jsonb_agg(
          jsonb_build_object(
            'action_id', wp.action_id,
            'self_select', wp.self_select,
            'display_order', wp.display_order
          ) ORDER BY wp.display_order
        )
        FROM weekly_plan wp
        WHERE wp.role_id = cf.role_id
          AND wp.week_start_date = cf.assignment_monday
          AND wp.status = 'locked'),
        (SELECT jsonb_agg(
          jsonb_build_object(
            'action_id', wf.action_id,
            'self_select', wf.self_select,
            'display_order', wf.display_order
          ) ORDER BY wf.display_order
        )
        FROM weekly_focus wf
        WHERE wf.role_id = cf.role_id
          AND wf.cycle = cf.cycle_number
          AND wf.week_in_cycle = cf.week_in_cycle)
      ) AS assigned_moves
    FROM cycle_final cf
  ),
  activity AS (
    SELECT DISTINCT ON (a.id)
      a.id,
      ws.updated_at AS activity_at,
      'score' AS kind,
      'Submitted scores' AS text
    FROM assignments a
    JOIN weekly_scores ws ON ws.staff_id = a.id
    WHERE ws.updated_at >= (p_now - INTERVAL '30 days')
    ORDER BY a.id, ws.updated_at DESC
  ),
  backlog AS (
    SELECT
      a.id,
      COUNT(*) AS count
    FROM assignments a
    JOIN user_backlog_v2 ub ON ub.staff_id = a.id
    WHERE ub.resolved_on IS NULL
    GROUP BY a.id
  ),
  onboarding_calc AS (
    SELECT
      a.id,
      CASE
        WHEN a.hire_date IS NULL OR a.onboarding_weeks = 0 THEN 0
        ELSE GREATEST(0, a.onboarding_weeks - FLOOR(EXTRACT(epoch FROM (p_now - a.hire_date::timestamptz)) / 604800)::int)
      END AS weeks_left
    FROM assignments a
  ),
  state_calc AS (
    SELECT
      a.*,
      act.activity_at,
      act.kind AS activity_kind,
      act.text AS activity_text,
      COALESCE(bl.count, 0) AS backlog_cnt,
      ob.weeks_left,
      CASE
        WHEN ob.weeks_left > 0 THEN 'onboarding'
        WHEN a.assigned_moves IS NULL THEN 'no_assignments'
        WHEN NOT EXISTS (
          SELECT 1 FROM weekly_scores ws2
          WHERE ws2.staff_id = a.id
            AND ws2.weekly_focus_id IN (
              SELECT wf2.id::text FROM weekly_focus wf2
              WHERE wf2.role_id = a.role_id
                AND wf2.cycle = a.cycle_number
                AND wf2.week_in_cycle = a.week_in_cycle
            )
        ) THEN 'no_activity'
        WHEN p_now > a.performance_deadline THEN 'missed_checkin'
        ELSE 'in_progress'
      END AS state
    FROM assignments a
    LEFT JOIN activity act ON act.id = a.id
    LEFT JOIN backlog bl ON bl.id = a.id
    LEFT JOIN onboarding_calc ob ON ob.id = a.id
  )
  SELECT
    sc.id AS staff_id,
    sc.name AS staff_name,
    sc.role_id,
    sc.role_name,
    sc.primary_location_id AS location_id,
    sc.location_name,
    sc.organization_name,
    sc.cycle_number,
    sc.week_in_cycle,
    ('C' || sc.cycle_number || 'W' || sc.week_in_cycle) AS week_label,
    sc.state AS status_state,
    CASE sc.state
      WHEN 'onboarding' THEN 'Onboarding'
      WHEN 'no_assignments' THEN 'No Assignments'
      WHEN 'no_activity' THEN 'No Activity'
      WHEN 'missed_checkin' THEN 'Missed Check-in'
      WHEN 'in_progress' THEN 'In Progress'
      ELSE 'Unknown'
    END AS status_label,
    CASE sc.state
      WHEN 'missed_checkin' THEN 'red'
      WHEN 'no_activity' THEN 'yellow'
      WHEN 'no_assignments' THEN 'yellow'
      WHEN 'in_progress' THEN 'green'
      ELSE 'grey'
    END AS status_severity,
    CASE sc.state
      WHEN 'onboarding' THEN sc.weeks_left || ' weeks remaining'
      WHEN 'no_assignments' THEN 'No pro-moves assigned for this week'
      WHEN 'no_activity' THEN 'No scores submitted yet'
      WHEN 'missed_checkin' THEN 'Deadline passed without complete submission'
      WHEN 'in_progress' THEN 'Working on this week'
      ELSE ''
    END AS status_detail,
    sc.performance_deadline AS deadline_at,
    sc.activity_at AS last_activity_at,
    sc.activity_kind AS last_activity_kind,
    sc.activity_text AS last_activity_text,
    sc.backlog_cnt AS backlog_count,
    sc.weeks_left AS onboarding_weeks_left
  FROM state_calc sc
  ORDER BY sc.state, sc.name;
END;
$function$;