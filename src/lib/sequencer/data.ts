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
 * 2. confidenceHistory (last 18 weeks):
 *    SELECT
 *      ws.weekly_focus_id,
 *      wf.action_id as proMoveId,
 *      DATE_TRUNC('week', ws.confidence_date)::date as weekStart,
 *      AVG(ws.confidence_score / 10.0) as avg,
 *      COUNT(*) as n
 *    FROM weekly_scores ws
 *    JOIN weekly_focus wf ON wf.id = ws.weekly_focus_id
 *    JOIN staff s ON s.id = ws.staff_id
 *    JOIN locations l ON l.id = s.primary_location_id
 *    WHERE l.organization_id = :orgId
 *      AND wf.role_id = :role
 *      AND ws.confidence_date >= (:effectiveDate - INTERVAL '18 weeks')
 *      AND ws.confidence_score IS NOT NULL
 *    GROUP BY wf.action_id, weekStart
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
 * 4. lastSelected (org-wide schedule history):
 *    SELECT
 *      wf.action_id as proMoveId,
 *      MAX(wf.cycle || '-' || wf.week_in_cycle) as lastCycleWeek
 *    FROM weekly_focus wf
 *    JOIN ... (link to org via location/staff)
 *    WHERE ... org_id = :orgId
 *      AND wf.role_id = :role
 *    GROUP BY wf.action_id
 * 
 * 5. domainCoverage8w:
 *    SELECT
 *      c.domain_id as domainId,
 *      8 as weeksCounted,
 *      COUNT(DISTINCT wf.cycle || '-' || wf.week_in_cycle) as appearances
 *    FROM weekly_focus wf
 *    JOIN pro_moves pm ON pm.action_id = wf.action_id
 *    JOIN competencies c ON c.competency_id = pm.competency_id
 *    WHERE ... (last 8 weeks for org)
 *    GROUP BY c.domain_id
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
