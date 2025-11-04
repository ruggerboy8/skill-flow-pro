-- Phase 3: Org Sequencer Data Adapter RPCs
-- These functions fetch org-wide data for the sequencer engine

-- 1) Confidence history: last 18 weeks org-wide, grouped by move and local week
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
) AS $$
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
$$ LANGUAGE plpgsql STABLE;

-- 2) Latest quarterly evaluations: org-wide average by competency
CREATE OR REPLACE FUNCTION seq_latest_quarterly_evals(
  p_org_id UUID,
  p_role_id BIGINT
) RETURNS TABLE (
  competency_id BIGINT,
  score01 NUMERIC,
  effective_date TEXT
) AS $$
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
$$ LANGUAGE plpgsql STABLE;

-- 3) Last selected: org-wide last week each move appeared in schedule
CREATE OR REPLACE FUNCTION seq_last_selected_by_move(
  p_org_id UUID,
  p_role_id BIGINT,
  p_tz TEXT
) RETURNS TABLE (
  pro_move_id BIGINT,
  week_start TEXT
) AS $$
BEGIN
  -- Note: weekly_focus doesn't have direct org linkage in current schema
  -- This assumes weekly_focus is org-wide. Adjust join if needed.
  -- For now, return all moves for the role (org-wide global schedule)
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
$$ LANGUAGE plpgsql STABLE;

-- 4) Domain coverage last 8 weeks: count distinct weeks each domain appeared
CREATE OR REPLACE FUNCTION seq_domain_coverage_8w(
  p_org_id UUID,
  p_role_id BIGINT,
  p_tz TEXT,
  p_effective_date TIMESTAMPTZ
) RETURNS TABLE (
  domain_id BIGINT,
  weeks_counted INT,
  appearances BIGINT
) AS $$
BEGIN
  -- Note: weekly_focus is org-wide. Count distinct weeks where domain appeared.
  -- This uses the same cycle-based week calculation as last_selected.
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
      -- Last 8 weeks approximation (cycle-based)
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
$$ LANGUAGE plpgsql STABLE;