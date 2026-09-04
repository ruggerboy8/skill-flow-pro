import { supabase } from '@/integrations/supabase/client';

// PML-2a: storage unification. New org-custom moves write into pro_moves
// (owner_org_id = org, source = 'org_custom'). During the transition window
// between this frontend shipping and the fold migration actually running
// (docs/specs/pml-2-tenant-content-unification.md's "deploy-order trap"),
// the org's custom moves can still live in the legacy organization_pro_moves
// table, so every read is a DUAL READ: fetch both sources, merge, done. Once
// the migration runs, every organization_pro_moves row gets a
// migrated_action_id stamped on it and this helper's second query returns
// nothing forever after; the dual read quietly becomes a single read
// without any further code change.

export interface OrgCustomMoveRow {
  /** Unique across the merged set regardless of source. */
  key: string;
  source: 'pro_moves' | 'organization_pro_moves';
  /** Set when source === 'pro_moves' (post-fold rows and new creations). */
  actionId: number | null;
  /** Set when source === 'organization_pro_moves' (not-yet-migrated rows). */
  legacyId: string | null;
  actionStatement: string;
  description: string | null;
  roleId: number | null;
  roleName: string;
  competencyId: number | null;
  competencyName: string;
  domainName: string;
  practiceTypes: string[];
}

interface RawJoinedRow {
  id: number | string;
  action_statement: string;
  description: string | null;
  role_id: number | null;
  competency_id: number | null;
  practice_types: string[] | null;
  roles?: { role_name: string } | null;
  competencies?: {
    name: string;
    domains?: { domain_name: string } | null;
  } | null;
}

/** Pure: shapes one joined row from either source table into OrgCustomMoveRow. */
export function mapOrgCustomMoveRow(
  row: RawJoinedRow,
  source: OrgCustomMoveRow['source']
): OrgCustomMoveRow {
  const isPlatformTable = source === 'pro_moves';
  return {
    key: `${source}-${row.id}`,
    source,
    actionId: isPlatformTable ? Number(row.id) : null,
    legacyId: isPlatformTable ? null : String(row.id),
    actionStatement: row.action_statement,
    description: row.description ?? null,
    roleId: row.role_id ?? null,
    roleName: row.roles?.role_name ?? '—',
    competencyId: row.competency_id ?? null,
    competencyName: row.competencies?.name ?? '—',
    domainName: row.competencies?.domains?.domain_name ?? '—',
    practiceTypes: row.practice_types ?? [],
  };
}

/**
 * Fetches an org's custom moves from both storage locations and merges them,
 * sorted alphabetically by statement. See the module header for why there
 * are two sources.
 */
export async function fetchOrgCustomMoves(orgId: string): Promise<OrgCustomMoveRow[]> {
  const [migratedResult, legacyResult] = await Promise.all([
    supabase
      .from('pro_moves')
      .select(`
        action_id, action_statement, description, role_id, competency_id, practice_types,
        roles!fk_pro_moves_role_id(role_name),
        competencies!fk_pro_moves_competency_id(
          name,
          domains!fk_competencies_domain_id(domain_name)
        )
      `)
      .eq('owner_org_id', orgId)
      .eq('active', true)
      .order('action_id'),
    (supabase as any)
      .from('organization_pro_moves')
      .select(`
        id, action_statement, description, role_id, competency_id, practice_types,
        roles!organization_pro_moves_role_id_fkey(role_name),
        competencies!organization_pro_moves_competency_id_fkey(
          name,
          domains!fk_competencies_domain_id(domain_name)
        )
      `)
      .eq('org_id', orgId)
      .eq('active', true)
      .is('migrated_action_id', null)
      .order('sort_order'),
  ]);

  const migrated = (migratedResult.data ?? []).map((row: any) =>
    mapOrgCustomMoveRow({ ...row, id: row.action_id }, 'pro_moves')
  );
  const legacy = (legacyResult.data ?? []).map((row: any) =>
    mapOrgCustomMoveRow(row, 'organization_pro_moves')
  );

  return [...migrated, ...legacy].sort((a, b) => a.actionStatement.localeCompare(b.actionStatement));
}

/** Creates a new org-custom move. Always writes to pro_moves (PML-2a: this is the one write path going forward). */
export async function createOrgCustomMove(
  orgId: string,
  input: {
    actionStatement: string;
    description: string | null;
    roleId: number | null;
    competencyId: number | null;
    practiceTypes: string[];
  }
) {
  return supabase
    .from('pro_moves')
    .insert({
      owner_org_id: orgId,
      source: 'org_custom',
      action_statement: input.actionStatement,
      description: input.description,
      role_id: input.roleId,
      competency_id: input.competencyId,
      practice_types: input.practiceTypes,
      active: true,
    })
    .select('action_id')
    .single();
}

/** Edits an existing org-custom move's statement/description on whichever table it actually lives in. */
export async function updateOrgCustomMove(
  row: Pick<OrgCustomMoveRow, 'source' | 'actionId' | 'legacyId'>,
  updates: { actionStatement: string; description: string | null }
) {
  if (row.source === 'pro_moves') {
    return supabase
      .from('pro_moves')
      .update({ action_statement: updates.actionStatement, description: updates.description })
      .eq('action_id', row.actionId as number);
  }
  return (supabase as any)
    .from('organization_pro_moves')
    .update({ action_statement: updates.actionStatement, description: updates.description })
    .eq('id', row.legacyId as string);
}

/** Deactivates an org-custom move on whichever table it actually lives in. */
export async function deactivateOrgCustomMove(
  row: Pick<OrgCustomMoveRow, 'source' | 'actionId' | 'legacyId'>
) {
  if (row.source === 'pro_moves') {
    return supabase.from('pro_moves').update({ active: false }).eq('action_id', row.actionId as number);
  }
  return (supabase as any)
    .from('organization_pro_moves')
    .update({ active: false })
    .eq('id', row.legacyId as string);
}
