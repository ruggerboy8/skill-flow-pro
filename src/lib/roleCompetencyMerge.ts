/**
 * Merge-then-filter half of the round-3 lead-competency logic, extracted
 * from src/hooks/useDomainDetail.ts so useCraftAtlas can reuse it verbatim
 * instead of re-implementing it. Behavior must stay identical to what
 * DomainDetail.tsx has shipped with — see
 * docs/features/explore-my-role-build-instructions.md section D.
 *
 * Leads merge in competencies from their lead role (see
 * useResolvedRoleIds). The Lead Dental Assistant role carries competencies
 * that mostly duplicate the base role's, but occasionally the lead-role
 * copy is the only one left holding an active pro move (leftovers from the
 * retired lead panel). Rather than let that surviving move sit in its own
 * orphaned lead-role competency card next to an identically-named, richer
 * base-role card, same-named competencies merge first (trimmed,
 * case-insensitive): a lead-role competency's pro moves fold into the
 * base-role competency of the same name (deduped by action_id), and the
 * lead copy is dropped. The base competency's id/description/observer
 * score win, since evaluations key off the base role's competency ids. A
 * lead competency with no base-role name match stays as its own entry
 * (lead-exclusive competencies are legitimate if they ever carry moves).
 * Only after merging do we drop any remaining competency, base or lead,
 * left with zero pro moves.
 */

export interface MergeableCompetency<TMove extends { action_id: number }> {
  competency_id: number;
  role_id: number | null;
  title: string;
  proMoves: TMove[];
}

export function mergeLeadCompetencies<
  TMove extends { action_id: number },
  TComp extends MergeableCompetency<TMove>
>(rawCompetencies: TComp[], baseRoleId: number | null | undefined): Omit<TComp, 'role_id'>[] {
  const normalizeTitle = (s: string) => s.trim().toLowerCase();

  const baseByName = new Map<string, TComp>();
  for (const c of rawCompetencies) {
    if (c.role_id === baseRoleId) baseByName.set(normalizeTitle(c.title), c);
  }

  const mergedAwayIds = new Set<number>();
  for (const c of rawCompetencies) {
    if (c.role_id === baseRoleId) continue; // only fold lead rows into base
    const match = baseByName.get(normalizeTitle(c.title));
    if (!match) continue; // lead-exclusive competency: keep as its own entry

    const existingActionIds = new Set(match.proMoves.map((pm) => pm.action_id));
    for (const pm of c.proMoves) {
      if (!existingActionIds.has(pm.action_id)) {
        match.proMoves.push(pm);
        existingActionIds.add(pm.action_id);
      }
    }
    mergedAwayIds.add(c.competency_id);
  }

  return rawCompetencies
    .filter((c) => !mergedAwayIds.has(c.competency_id))
    .filter((c) => c.proMoves.length > 0)
    .map(({ role_id, ...rest }) => rest as Omit<TComp, 'role_id'>);
}
