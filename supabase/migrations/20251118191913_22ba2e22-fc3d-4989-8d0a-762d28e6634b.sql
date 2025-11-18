-- ============================================================================
-- Fix Week Calculation and Last Activity Selection in get_staff_statuses
-- ============================================================================
-- 
-- SHARED WEEK CALCULATION FORMULA (used by both get_staff_statuses and get_staff_week_assignments):
-- week_index = weeks_elapsed_since_program_start (0-based)
-- cycle_number = CASE WHEN week_index = 0 THEN 1 ELSE (week_index / cycle_length)::int + 1 END
-- week_in_cycle = CASE WHEN week_index = 0 THEN 1 ELSE (week_index % cycle_length)::int + 1 END
-- 
-- This migration aligns get_staff_statuses to use the same formula as get_staff_week_assignments
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_staff_statuses(p_coach_user_id uuid, p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(staff_id uuid, staff_name text, role_id bigint, role_name text, location_id uuid, location_name text, organization_id uuid, organization_name text, active_monday date, cycle_number integer, week_in_cycle integer, phase text, checkin_due timestamp with time zone, checkout_open timestamp with time zone, checkout_due timestamp with time zone, required_count integer, conf_count integer, perf_count integer, backlog_count integer, last_activity_kind text, last_activity_at timestamp with time zone, source_used text, tz text)
 LANGUAGE sql
 STABLE
AS $function$
WITH coach_info AS (
  SELECT 
    s.is_super_admin,
    l.organization_id
  FROM staff s
  LEFT JOIN locations l ON l.id = s.primary_location_id
  WHERE s.user_id = p_coach_user_id
),
visible_staff AS (
  SELECT 
    s.id AS staff_id, 
    s.name AS staff_name, 
    s.role_id::bigint AS role_id,
    s.primary_location_id AS location_id,
    r.role_name, 
    l.name AS location_name, 
    l.timezone AS tz,
    l.organization_id, 
    o.name AS organization_name,
    l.program_start_date, 
    l.cycle_length_weeks
  FROM staff s
  JOIN roles r ON r.role_id = s.role_id
  JOIN locations l ON l.id = s.primary_location_id
  JOIN organizations o ON o.id = l.organization_id
  CROSS JOIN coach_info ci
  WHERE s.is_participant = TRUE
    AND (ci.is_super_admin OR l.organization_id = ci.organization_id)
),
week_ctx AS (
  SELECT
    vs.*,
    (date_trunc('week', (p_now AT TIME ZONE vs.tz))::date) AS active_monday,
    GREATEST(0,
      ((date_trunc('week', (p_now AT TIME ZONE vs.tz))::date)
       - (date_trunc('week', vs.program_start_date::timestamp AT TIME ZONE vs.tz)::date)) / 7
    )::int AS week_index
  FROM visible_staff vs
),
cycle_calc AS (
  SELECT
    wc.*,
    -- FIXED: Use same formula as get_staff_week_assignments (no -1 adjustment)
    CASE 
      WHEN wc.week_index = 0 THEN 1
      ELSE (wc.week_index / wc.cycle_length_weeks)::int + 1
    END AS cycle_number,
    CASE 
      WHEN wc.week_index = 0 THEN 1
      ELSE (wc.week_index % wc.cycle_length_weeks)::int + 1
    END AS week_in_cycle
  FROM week_ctx wc
),
phase_calc AS (
  SELECT
    cc.*,
    CASE 
      WHEN cc.cycle_number <= 3 THEN 'focus' 
      ELSE 'plan' 
    END AS phase
  FROM cycle_calc cc
),
anchors AS (
  SELECT
    pc.*,
    ((pc.active_monday + 1) || ' 12:00:00 ' || pc.tz)::timestamptz AS checkin_due,
    ((pc.active_monday + 3) || ' 00:00:00 ' || pc.tz)::timestamptz AS checkout_open,
    ((pc.active_monday + 4) || ' 17:00:00 ' || pc.tz)::timestamptz AS checkout_due
  FROM phase_calc pc
),
source_choice AS (
  SELECT
    a.*,
    CASE
      WHEN a.cycle_number >= 4 THEN 'plan'
      ELSE 'focus'
    END AS source_used
  FROM anchors a
),
assignments AS (
  SELECT
    sc.*,
    CASE
      WHEN sc.source_used = 'plan' THEN (
        SELECT COUNT(*)::int
        FROM weekly_plan wp
        WHERE wp.role_id = sc.role_id::int
          AND wp.week_start_date = sc.active_monday
          AND wp.status = 'locked'
          AND wp.self_select = false
          AND (wp.org_id = sc.organization_id OR 
               (wp.org_id IS NULL AND NOT EXISTS (
                 SELECT 1 FROM weekly_plan wpo
                 WHERE wpo.role_id = sc.role_id::int
                   AND wpo.week_start_date = sc.active_monday
                   AND wpo.status = 'locked'
                   AND wpo.org_id = sc.organization_id
               )))
      )
      ELSE (
        SELECT COUNT(*)::int
        FROM weekly_focus wf
        WHERE wf.role_id = sc.role_id
          AND wf.cycle = sc.cycle_number
          AND wf.week_in_cycle = sc.week_in_cycle
          AND wf.self_select = false
      )
    END AS required_count
  FROM source_choice sc
),
scores AS (
  SELECT
    a.*,
    (
      SELECT COUNT(*)::int
      FROM weekly_scores ws
      LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
      WHERE ws.staff_id = a.staff_id
        AND ws.confidence_score IS NOT NULL
        AND (
          (wf.id IS NOT NULL AND wf.cycle = a.cycle_number AND wf.week_in_cycle = a.week_in_cycle)
          OR (wf.id IS NULL AND ws.week_of = a.active_monday)
        )
    ) AS conf_count,
    (
      SELECT COUNT(*)::int
      FROM weekly_scores ws
      LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
      WHERE ws.staff_id = a.staff_id
        AND ws.performance_score IS NOT NULL
        AND (
          (wf.id IS NOT NULL AND wf.cycle = a.cycle_number AND wf.week_in_cycle = a.week_in_cycle)
          OR (wf.id IS NULL AND ws.week_of = a.active_monday)
        )
    ) AS perf_count,
    -- FIXED: Improved ordering to handle same-timestamp submissions and prioritize performance
    (
      SELECT CASE 
        WHEN ws.performance_score IS NOT NULL THEN 'performance'
        WHEN ws.confidence_score IS NOT NULL THEN 'confidence'
        ELSE NULL
      END
      FROM weekly_scores ws
      LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
      WHERE ws.staff_id = a.staff_id
        AND (
          (wf.id IS NOT NULL AND wf.cycle = a.cycle_number AND wf.week_in_cycle = a.week_in_cycle)
          OR (wf.id IS NULL AND ws.week_of = a.active_monday)
        )
        -- Only consider rows with at least one score
        AND (ws.confidence_score IS NOT NULL OR ws.performance_score IS NOT NULL)
      ORDER BY 
        -- Prioritize performance over confidence
        CASE 
          WHEN ws.performance_score IS NOT NULL THEN 0
          WHEN ws.confidence_score IS NOT NULL THEN 1
          ELSE 2
        END,
        -- Then by timestamp (latest first)
        COALESCE(ws.performance_date, ws.confidence_date) DESC NULLS LAST
      LIMIT 1
    ) AS last_activity_kind,
    (
      SELECT CASE 
        WHEN ws.performance_score IS NOT NULL THEN ws.performance_date
        WHEN ws.confidence_score IS NOT NULL THEN ws.confidence_date
        ELSE NULL
      END
      FROM weekly_scores ws
      LEFT JOIN weekly_focus wf ON wf.id::text = ws.weekly_focus_id
      WHERE ws.staff_id = a.staff_id
        AND (
          (wf.id IS NOT NULL AND wf.cycle = a.cycle_number AND wf.week_in_cycle = a.week_in_cycle)
          OR (wf.id IS NULL AND ws.week_of = a.active_monday)
        )
        -- Only consider rows with at least one score
        AND (ws.confidence_score IS NOT NULL OR ws.performance_score IS NOT NULL)
      ORDER BY 
        -- Same ordering as last_activity_kind to keep them in sync
        CASE 
          WHEN ws.performance_score IS NOT NULL THEN 0
          WHEN ws.confidence_score IS NOT NULL THEN 1
          ELSE 2
        END,
        COALESCE(ws.performance_date, ws.confidence_date) DESC NULLS LAST
      LIMIT 1
    ) AS last_activity_at
  FROM assignments a
),
backlog_calc AS (
  SELECT
    s.*,
    COALESCE((
      SELECT COUNT(*)::int
      FROM user_backlog_v2 ub
      WHERE ub.staff_id = s.staff_id
        AND ub.resolved_on IS NULL
    ), 0) AS backlog_count
  FROM scores s
)
SELECT 
  bc.staff_id,
  bc.staff_name,
  bc.role_id,
  bc.role_name,
  bc.location_id,
  bc.location_name,
  bc.organization_id,
  bc.organization_name,
  bc.active_monday,
  bc.cycle_number,
  bc.week_in_cycle,
  bc.phase,
  bc.checkin_due,
  bc.checkout_open,
  bc.checkout_due,
  bc.required_count,
  bc.conf_count,
  bc.perf_count,
  bc.backlog_count,
  bc.last_activity_kind,
  bc.last_activity_at,
  bc.source_used,
  bc.tz
FROM backlog_calc bc
ORDER BY 
  bc.organization_name,
  bc.location_name,
  bc.staff_name;
$function$;

-- ============================================================================
-- Regression Test: Verify Both RPCs Return Same Cycle/Week
-- ============================================================================

DO $$
DECLARE
  v_test_staff_id uuid;
  v_test_role_id bigint;
  v_test_week_start date;
  v_status_result record;
  v_assignment_result jsonb;
  v_status_cycle int;
  v_status_week int;
  v_assign_cycle int;
  v_assign_week int;
BEGIN
  -- Find a test staff member with valid location
  SELECT s.id, s.role_id, l.program_start_date
  INTO v_test_staff_id, v_test_role_id, v_test_week_start
  FROM staff s
  JOIN locations l ON l.id = s.primary_location_id
  WHERE s.is_participant = true
    AND s.primary_location_id IS NOT NULL
  LIMIT 1;

  IF v_test_staff_id IS NULL THEN
    RAISE NOTICE 'No test staff found, skipping regression test';
    RETURN;
  END IF;

  -- Use current week for testing
  v_test_week_start := date_trunc('week', now())::date;

  -- Get result from get_staff_statuses
  SELECT cycle_number, week_in_cycle
  INTO v_status_cycle, v_status_week
  FROM get_staff_statuses(
    (SELECT user_id FROM staff WHERE id = v_test_staff_id),
    now()
  )
  WHERE staff_id = v_test_staff_id;

  -- Get result from get_staff_week_assignments
  SELECT get_staff_week_assignments(v_test_staff_id, v_test_role_id, v_test_week_start)
  INTO v_assignment_result;

  v_assign_cycle := (v_assignment_result->'week_context'->>'cycle')::int;
  v_assign_week := (v_assignment_result->'week_context'->>'week_in_cycle')::int;

  -- Assert they match
  IF v_status_cycle != v_assign_cycle OR v_status_week != v_assign_week THEN
    RAISE EXCEPTION 'REGRESSION TEST FAILED: Week calculation mismatch! get_staff_statuses returned cycle=%, week=% but get_staff_week_assignments returned cycle=%, week=%',
      v_status_cycle, v_status_week, v_assign_cycle, v_assign_week;
  END IF;

  RAISE NOTICE 'REGRESSION TEST PASSED: Both RPCs agree on cycle=%, week=%', v_status_cycle, v_status_week;
END;
$$;