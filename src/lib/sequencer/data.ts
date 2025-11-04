/**
 * Phase 2: Data Adapter Stub
 * 
 * In Phase 3, this will query Supabase to fetch org-wide inputs.
 * For now, it's a documented stub that throws an error.
 */

import { OrgInputs, RoleId } from './types';

interface FetchParams {
  orgId?: string;         // Optional: Organization UUID. If omitted, fetch Alcan-wide.
  role: RoleId;           // 1=DFI, 2=RDA
  effectiveDate: Date;    // "As of" date (typically Saturday)
  timezone: string;       // e.g., "America/Chicago"
}

/**
 * Fetch org-wide inputs for sequencer engine.
 * 
 * Phase 3 TODO: Implement Supabase queries.
 * 
 * Expected queries:
 * 
 * 1. eligibleMoves:
 *    SELECT 
 *      pm.action_id as id,
 *      pm.action_statement as name,
 *      pm.competency_id as competencyId,
 *      c.domain_id as domainId,
 *      pm.active as isActive
 *    FROM pro_moves pm
 *    JOIN competencies c ON c.competency_id = pm.competency_id
 *    WHERE pm.role_id = :role
 *      AND pm.active = true
 * 
 * 2. confidenceHistory (last 18 weeks, local week start in org tz):
 *    SELECT
 *      wf.action_id AS "proMoveId",
 *      (DATE_TRUNC('week', (ws.confidence_date AT TIME ZONE :timezone))::date) AS "weekStart",
 *      AVG(ws.confidence_score / 10.0) AS "avg",
 *      COUNT(*) AS "n"
 *    FROM weekly_scores ws
 *    JOIN weekly_focus wf ON wf.id = ws.weekly_focus_id
 *    JOIN staff s ON s.id = ws.staff_id
 *    JOIN locations l ON l.id = s.primary_location_id
 *    WHERE l.organization_id = :orgId
 *      AND wf.role_id = :role
 *      AND (ws.confidence_date AT TIME ZONE :timezone) >= (:effectiveDate - INTERVAL '18 weeks')
 *      AND ws.confidence_score IS NOT NULL
 *    GROUP BY wf.action_id, "weekStart"
 * 
 * 3. evals (latest quarterly snapshot):
 *    SELECT
 *      ei.competency_id as competencyId,
 *      AVG(ei.observer_score / 10.0) as score01,
 *      MAX(e.updated_at)::date as effectiveDate
 *    FROM evaluation_items ei
 *    JOIN evaluations e ON e.id = ei.evaluation_id
 *    JOIN staff s ON s.id = e.staff_id
 *    JOIN locations l ON l.id = s.primary_location_id
 *    WHERE l.organization_id = :orgId
 *      AND e.type = 'Quarterly'
 *      AND e.status = 'submitted'
 *      AND ei.observer_score IS NOT NULL
 *    GROUP BY ei.competency_id
 * 
 * 4. lastSelected (org-wide schedule history with date):
 *    SELECT
 *      wf.action_id AS "proMoveId",
 *      MAX((wf.week_start AT TIME ZONE :timezone)::date) AS "weekStart"
 *    FROM weekly_focus wf
 *    JOIN locations l ON l.id = wf.organization_location_id
 *    WHERE l.organization_id = :orgId
 *      AND wf.role_id = :role
 *    GROUP BY wf.action_id
 * 
 * 5. domainCoverage8w (distinct weeks in last 8 weeks):
 *    WITH last8 AS (
 *      SELECT DISTINCT
 *        (DATE_TRUNC('week', (wf.week_start AT TIME ZONE :timezone))::date) AS week_start_local,
 *        pm.action_id,
 *        c.domain_id
 *      FROM weekly_focus wf
 *      JOIN pro_moves pm ON pm.action_id = wf.action_id
 *      JOIN competencies c ON c.competency_id = pm.competency_id
 *      JOIN locations l ON l.id = wf.organization_location_id
 *      WHERE l.organization_id = :orgId
 *        AND wf.role_id = :role
 *        AND (wf.week_start AT TIME ZONE :timezone) >= (:effectiveDate - INTERVAL '8 weeks')
 *    )
 *    SELECT
 *      domain_id AS "domainId",
 *      8 AS "weeksCounted",
 *      COUNT(DISTINCT week_start_local) AS "appearances"
 *    FROM last8
 *    GROUP BY domain_id
 * 
 * @param params - Fetch parameters
 * @returns Org-wide inputs for engine
 * @throws Error (Phase 2 stub)
 */
export async function fetchAlcanInputsForRole(params: FetchParams): Promise<OrgInputs> {
  const { orgId, role, effectiveDate, timezone } = params;
  
  const { supabase } = await import('@/integrations/supabase/client');
  
  // 1) eligibleMoves: active pro-moves for this role with joined domain_id
  const { data: moves, error: movesErr } = await supabase
    .from('pro_moves')
    .select(`
      action_id,
      action_statement,
      competency_id,
      active,
      competencies:competency_id ( domain_id )
    `)
    .eq('role_id', role)
    .eq('active', true);
  
  if (movesErr) throw new Error(`Failed to fetch eligible moves: ${movesErr.message}`);
  
  const eligibleMoves = (moves || []).map((m: any) => ({
    id: m.action_id,
    name: m.action_statement,
    competencyId: m.competency_id,
    domainId: m.competencies?.domain_id ?? 0,
    isActive: m.active,
  }));
  
  // 2) confidenceHistory: last 18 weeks, org-wide per move
  const { data: conf, error: confErr } = await supabase.rpc('seq_confidence_history_18w', {
    p_org_id: orgId || null,
    p_role_id: role,
    p_tz: timezone,
    p_effective_date: effectiveDate.toISOString(),
  });
  
  if (confErr) throw new Error(`Failed to fetch confidence history: ${confErr.message}`);
  
  const confidenceHistory = (conf || []).map((r: any) => ({
    proMoveId: r.pro_move_id,
    weekStart: r.week_start,
    avg: Number(r.avg01),
    n: Number(r.n),
  }));
  
  // 3) evals: latest quarterly evaluations by competency
  const { data: evals, error: evalsErr } = await supabase.rpc('seq_latest_quarterly_evals', {
    p_org_id: orgId || null,
    p_role_id: role,
  });
  
  if (evalsErr) throw new Error(`Failed to fetch quarterly evals: ${evalsErr.message}`);
  
  const evalCompetencies = (evals || []).map((r: any) => ({
    competencyId: r.competency_id,
    score01: Number(r.score01),
    effectiveDate: r.effective_date,
  }));
  
  // 4) lastSelected: org-wide last scheduled week per move
  const { data: lastSel, error: lastErr } = await supabase.rpc('seq_last_selected_by_move', {
    p_org_id: orgId || null,
    p_role_id: role,
    p_tz: timezone,
  });
  
  if (lastErr) throw new Error(`Failed to fetch last selected: ${lastErr.message}`);
  
  const lastSelected = (lastSel || []).map((r: any) => ({
    proMoveId: r.pro_move_id,
    weekStart: r.week_start,
  }));
  
  // 5) domainCoverage8w: last 8 weeks per domain
  const { data: dom8, error: domErr } = await supabase.rpc('seq_domain_coverage_8w', {
    p_org_id: orgId || null,
    p_role_id: role,
    p_tz: timezone,
    p_effective_date: effectiveDate.toISOString(),
  });
  
  if (domErr) throw new Error(`Failed to fetch domain coverage: ${domErr.message}`);
  
  const domainCoverage8w = (dom8 || []).map((r: any) => ({
    domainId: r.domain_id,
    weeksCounted: Number(r.weeks_counted),
    appearances: Number(r.appearances),
  }));
  
  return {
    orgId: orgId || 'alcan-wide',
    role,
    timezone,
    eligibleMoves,
    confidenceHistory,
    evals: evalCompetencies,
    lastSelected,
    domainCoverage8w,
    now: effectiveDate,
  };
}
