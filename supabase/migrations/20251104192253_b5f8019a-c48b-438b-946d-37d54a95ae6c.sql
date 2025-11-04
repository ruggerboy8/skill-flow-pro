-- Fix security warnings: set search_path for sequencer RPCs

-- 1) Fix seq_confidence_history_18w
CREATE OR REPLACE FUNCTION seq_confidence_history_18w(
  p_org_id UUID,
  p_role_id BIGINT,
  p_tz TEXT,
  p_effective_date TIMESTAMPTZ
) RETURNS TABLE (
  pro_move_id BIGINT,
  week_start TEXT,
  avg01 NUMERIC,
  n BIGINT
) 
LANGUAGE plpgsql 
STABLE 
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    wf.action_id AS pro_move_id,
    TO_CHAR(DATE_TRUNC('week', ws.confidence_date AT TIME ZONE p_tz)::date, 'YYYY-MM-DD') AS week_start,
    AVG(ws.confidence_score / 10.0) AS avg01,
    COUNT(*) AS n
  FROM weekly_scores ws
  JOIN weekly_focus wf ON wf.id = ws.weekly_focus_id
  JOIN staff s ON s.id = ws.staff_id
  JOIN locations l ON l.id = s.primary_location_id
  WHERE l.organization_id = p_org_id
    AND wf.role_id = p_role_id
    AND (ws.confidence_date AT TIME ZONE p_tz) >= (p_effective_date AT TIME ZONE p_tz) - INTERVAL '18 weeks'
    AND ws.confidence_score IS NOT NULL
  GROUP BY wf.action_id, DATE_TRUNC('week', ws.confidence_date AT TIME ZONE p_tz)
  ORDER BY wf.action_id, week_start;
END;
$$;

-- 2) Fix seq_latest_quarterly_evals
CREATE OR REPLACE FUNCTION seq_latest_quarterly_evals(
  p_org_id UUID,
  p_role_id BIGINT
) RETURNS TABLE (
  competency_id BIGINT,
  score01 NUMERIC,
  effective_date TEXT
) 
LANGUAGE plpgsql 
STABLE 
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ei.competency_id,
    AVG(ei.observer_score / 10.0) AS score01,
    TO_CHAR(MAX(e.updated_at)::date, 'YYYY-MM-DD') AS effective_date
  FROM evaluation_items ei
  JOIN evaluations e ON e.id = ei.evaluation_id
  JOIN staff s ON s.id = e.staff_id
  JOIN locations l ON l.id = s.primary_location_id
  WHERE l.organization_id = p_org_id
    AND e.type = 'Quarterly'
    AND e.status = 'submitted'
    AND ei.observer_score IS NOT NULL
  GROUP BY ei.competency_id;
END;
$$;

-- 3) Fix seq_last_selected_by_move
CREATE OR REPLACE FUNCTION seq_last_selected_by_move(
  p_org_id UUID,
  p_role_id BIGINT,
  p_tz TEXT
) RETURNS TABLE (
  pro_move_id BIGINT,
  week_start TEXT
) 
LANGUAGE plpgsql 
STABLE 
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    wf.action_id AS pro_move_id,
    TO_CHAR(MAX(
      (DATE '1970-01-01' + (wf.cycle * 42 + wf.week_in_cycle * 7) * INTERVAL '1 day')
    )::date, 'YYYY-MM-DD') AS week_start
  FROM weekly_focus wf
  WHERE wf.role_id = p_role_id
    AND wf.action_id IS NOT NULL
  GROUP BY wf.action_id;
END;
$$;

-- 4) Fix seq_domain_coverage_8w
CREATE OR REPLACE FUNCTION seq_domain_coverage_8w(
  p_org_id UUID,
  p_role_id BIGINT,
  p_tz TEXT,
  p_effective_date TIMESTAMPTZ
) RETURNS TABLE (
  domain_id BIGINT,
  weeks_counted INT,
  appearances BIGINT
) 
LANGUAGE plpgsql 
STABLE 
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH recent_weeks AS (
    SELECT DISTINCT
      c.domain_id,
      (DATE '1970-01-01' + (wf.cycle * 42 + wf.week_in_cycle * 7) * INTERVAL '1 day')::date AS week_date
    FROM weekly_focus wf
    JOIN pro_moves pm ON pm.action_id = wf.action_id
    JOIN competencies c ON c.competency_id = pm.competency_id
    WHERE wf.role_id = p_role_id
      AND wf.action_id IS NOT NULL
      AND (DATE '1970-01-01' + (wf.cycle * 42 + wf.week_in_cycle * 7) * INTERVAL '1 day')
          >= (p_effective_date AT TIME ZONE p_tz)::date - INTERVAL '8 weeks'
  )
  SELECT
    rw.domain_id,
    8 AS weeks_counted,
    COUNT(DISTINCT rw.week_date) AS appearances
  FROM recent_weeks rw
  GROUP BY rw.domain_id;
END;
$$;