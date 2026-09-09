import { resolveStatement } from './contentOverrides';

// PML-1 Fix 5: shared resolver for turning a raw weekly_assignments row (as
// returned by the wizards' repair-mode queries, joined to pro_moves) into the
// display fields the check-in/check-out wizards need: action_statement,
// domain_name, intervention_text. Extracted so the org-move branch can be
// unit tested without standing up ConfidenceWizard/PerformanceWizard.
//
// Bug this fixes: an assignment carrying org_move_id (and a null action_id)
// has no pro_moves row to join to, so the old inline logic read
// item.pro_moves?.action_statement and got '', which showed a blank card to
// the participant. This already happened once in prod (Avenue Dental, week
// of 2026-06-15). The caller must batch-fetch org move meta first (see
// fetchOrgProMoveMetaByIds in src/lib/proMoves.ts) and pass it in here.
//
// PML-2b: participant-facing rewording. A platform move's statement is
// COALESCE(org content override, platform text); the `overrides` param
// (action_id -> custom_statement, see src/lib/contentOverrides.ts) applies
// only on the platform branch (item.action_id set, no org_move_id); org-custom
// moves are worded directly by the org, not through an override row.

export interface AssignmentRowForResolve {
  id: string | number;
  display_order: number;
  self_select?: boolean | null;
  org_move_id?: string | null;
  action_id?: number | null;
  pro_moves?: {
    action_statement?: string | null;
    intervention_text?: string | null;
    competencies?: {
      domains?: { domain_name?: string | null } | null;
    } | null;
  } | null;
  competencies?: {
    domains?: { domain_name?: string | null } | null;
  } | null;
}

export interface OrgMoveMetaForResolve {
  statement: string;
  domain: string;
}

export interface ResolvedAssignmentMove {
  weekly_focus_id: string;
  type: 'self_select' | 'site';
  display_order: number;
  action_statement: string;
  domain_name: string;
  intervention_text: string | null;
  required: true;
  locked: false;
}

/**
 * Resolve a batch of raw weekly_assignments rows (platform pro_moves joined
 * in-query, org custom moves not) into the wizards' display shape.
 *
 * `orgMoveMeta` must already contain an entry for every row's org_move_id
 * (fetch it first with fetchOrgProMoveMetaByIds). A row whose org_move_id
 * has no matching entry resolves to an empty statement and 'Unknown' domain
 * rather than throwing, so one bad id doesn't blank the whole wizard.
 *
 * `overrides` (default empty) is this org's content-override map, action_id
 * -> custom_statement (fetch it first with fetchContentOverrides). Applies
 * only to the platform branch; see the module header.
 */
export function resolveAssignmentRows(
  rows: AssignmentRowForResolve[],
  orgMoveMeta: Map<string, OrgMoveMetaForResolve>,
  overrides: Map<number, string> = new Map()
): ResolvedAssignmentMove[] {
  return rows.map((item) => {
    let actionStatement = '';
    let domainName = 'Unknown';
    let interventionText: string | null = null;

    if (item.org_move_id) {
      const meta = orgMoveMeta.get(item.org_move_id);
      actionStatement = meta?.statement || '';
      domainName = meta?.domain || 'Unknown';
    } else {
      if (item.pro_moves?.competencies?.domains?.domain_name) {
        domainName = item.pro_moves.competencies.domains.domain_name;
      } else if (item.competencies?.domains?.domain_name) {
        domainName = item.competencies.domains.domain_name;
      }
      actionStatement = resolveStatement(item.action_id, item.pro_moves?.action_statement || '', overrides);
      interventionText = item.pro_moves?.intervention_text ?? null;
    }

    return {
      weekly_focus_id: `assign:${item.id}`,
      type: item.self_select ? 'self_select' : 'site',
      display_order: item.display_order,
      action_statement: actionStatement,
      domain_name: domainName,
      intervention_text: interventionText,
      required: true,
      locked: false,
    };
  });
}

/** Collects the distinct org_move_ids present in a batch of raw rows. */
export function collectOrgMoveIds(rows: AssignmentRowForResolve[]): string[] {
  return Array.from(
    new Set(rows.map((r) => r.org_move_id).filter((id): id is string => !!id))
  );
}
