import { supabase } from '@/integrations/supabase/client';

// PML-2c: one shared eligibility rule. `org_visible_pro_moves` (the RPC) is
// THE rule for "which pro moves may this org see for this role": active
// platform moves whose practice_types match the org's practice_type, plus
// the org's own moves, minus the org's hidden list. The sequencer
// (sequencer-rank/index.ts) already calls this RPC; every picker and
// AI-suggest now call the exact same function through this one helper
// instead of re-implementing the rule three separate ways
// (docs/audits/tenant-model-audit-2026-09-03.md finding D). Because they all
// go through this one function, picker eligibility and sequencer eligibility
// agree by construction, not by three implementations happening to match.

export interface EligibleProMove {
  actionId: number;
  actionStatement: string;
  competencyId: number | null;
  roleId: number | null;
  practiceTypes: string[];
  /** Derived from ownerOrgId, not read off the row's own `source` column,
   *  so it's robust to the pre-2a period where org_custom rows didn't exist yet. */
  source: 'platform' | 'org_custom';
  ownerOrgId: string | null;
}

export interface EligibleProMoveRow {
  action_id: number;
  action_statement: string;
  competency_id: number | null;
  role_id: number | null;
  practice_types: string[] | null;
  source: string | null;
  owner_org_id: string | null;
}

/**
 * Maps one row of the org_visible_pro_moves RPC response into the shape the
 * frontend uses. Pure, no I/O, so it is unit-testable without a live
 * Supabase call.
 */
export function mapEligibleMoveRow(row: EligibleProMoveRow): EligibleProMove {
  return {
    actionId: row.action_id,
    actionStatement: row.action_statement,
    competencyId: row.competency_id ?? null,
    roleId: row.role_id ?? null,
    practiceTypes: row.practice_types ?? [],
    source: row.owner_org_id ? 'org_custom' : 'platform',
    ownerOrgId: row.owner_org_id ?? null,
  };
}

/**
 * Fetches every pro move this org may see for a role (or every role, if
 * roleId is omitted): active platform moves matching the org's practice
 * type, plus the org's own moves, minus the org's hidden list. Calls the
 * org_visible_pro_moves RPC; see the module header for why that, and not a
 * fourth ad-hoc query, is the mechanism.
 */
export async function fetchEligibleProMoves(
  orgId: string,
  roleId?: number | null
): Promise<EligibleProMove[]> {
  const { data, error } = await supabase.rpc('org_visible_pro_moves', {
    p_org_id: orgId,
    p_role_id: roleId ?? undefined,
  });
  if (error) throw error;
  return (data ?? []).map(mapEligibleMoveRow);
}
