/**
 * Phase 2: Data Adapter Stub
 * 
 * In Phase 3, this will query Supabase to fetch org-wide inputs.
 * For now, it's a documented stub that throws an error.
 */

import { OrgInputs, RoleId } from './types';

interface FetchParams {
  orgId: number;          // Organization ID from organizations table
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
export async function fetchOrgInputsForRole(params: FetchParams): Promise<OrgInputs> {
  const { orgId, role, effectiveDate, timezone } = params;
  
  // Phase 2: Stub implementation
  throw new Error(
    `fetchOrgInputsForRole not implemented (Phase 2 stub).\n` +
    `Params: orgId=${orgId}, role=${role}, effectiveDate=${effectiveDate.toISOString()}, timezone=${timezone}\n` +
    `Phase 3 TODO: Implement Supabase queries (see JSDoc comments).`
  );
}
