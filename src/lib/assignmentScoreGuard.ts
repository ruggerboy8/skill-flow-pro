// ASG-1 Fix 2 (fold-in): pure helper for GlobalAssignmentBuilder's save
// guard. Extracted so it can be unit tested without a React component or a
// Supabase round trip.
//
// GlobalAssignmentBuilder.handleSave previously superseded EVERY existing
// weekly_assignments row for a (role, week, org) with no check, orphaning
// any weekly_scores already submitted against those rows. This mirrors the
// "skippedLocked" pattern already used by planner-upsert and
// sequencer-auto-assign: a slot is locked once a weekly_scores row exists
// for its assignment id ('assign:' || row.id).
//
// Chosen behavior (see PR description): BLOCK the save if any slot being
// replaced already has a submitted score, rather than silently skipping
// just those slots. That matches the "editable until first score, immutable
// after" invariant used everywhere else in this codebase, and is simpler
// and safer for this high-blast-radius surface than a partial save.

export interface ExistingAssignmentSlot {
  id: string;
  display_order: number;
}

/**
 * Given the assignment rows that would be superseded by a save, and the set
 * of assignment ids ('assign:' || id) that have at least one weekly_scores
 * row, return the display_order slots that must block the save (sorted
 * ascending, de-duplicated). An empty array means the save may proceed.
 *
 * Pure: no Supabase, no I/O.
 */
export function findScoredSlotsBlockingSave(
  existingRows: ExistingAssignmentSlot[],
  scoredAssignmentIds: Set<string>,
): number[] {
  const blocking = new Set<number>();
  for (const row of existingRows) {
    if (scoredAssignmentIds.has(`assign:${row.id}`)) {
      blocking.add(row.display_order);
    }
  }
  return Array.from(blocking).sort((a, b) => a - b);
}
