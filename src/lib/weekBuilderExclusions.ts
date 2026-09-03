// PML-1 QA follow-up, closed in PML-2a: "no duplicate placement of an org
// move in one week." WeekBuilderPanel's picker excludes moves already placed
// in the same week so a coach can't pick the same move into two slots. Before
// PML-2a, an org-custom slot had `actionId: null` (it was only addressable by
// `orgMoveId`), so this exclusion silently skipped it. After PML-2a, a
// migrated org move has a real `action_id` in the slot just like a platform
// move, so the same exclusion now covers it too — this is a pure extraction
// of that computation so the claim is tested, not assumed.

export interface SlotForExclusion {
  actionId: number | null;
}

/** The distinct, non-null action_ids already placed somewhere in a week. */
export function computeExcludeActionIds(slots: SlotForExclusion[]): number[] {
  return Array.from(
    new Set(slots.map((s) => s.actionId).filter((id): id is number => id !== null))
  );
}
