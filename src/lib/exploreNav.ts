import type { AtlasCompetency } from '@/hooks/useCraftAtlas';
import type { ProMoveDetail } from '@/hooks/useDomainDetail';

/**
 * Pure navigation helpers for the Explore drill's move level
 * (`/my-role/move/:actionId`). Extracted so ancestor lookup, "Next move"
 * selection, and "Surprise me" can be unit tested without React or routing.
 * See docs/specs/mob-explore-rebuild.md §1 ("the containing competency and
 * domain are looked up from useCraftAtlas data") and §5 ("Next move"
 * ordering / "Surprise me").
 */

export interface MoveAncestors {
  competency: AtlasCompetency;
  move: ProMoveDetail;
}

/**
 * Finds the competency (and move) that owns a given action_id. The move's
 * domain/competency ancestors are always derivable this way — no navigation
 * stack or extra route params are needed.
 */
export function findMoveAncestors(competencies: AtlasCompetency[], actionId: number): MoveAncestors | null {
  for (const competency of competencies) {
    const move = competency.proMoves.find((m) => m.action_id === actionId);
    if (move) return { competency, move };
  }
  return null;
}

/**
 * The next move in the same competency, wrapping around at the end
 * (idx + 1 % length). Returns null when the current move isn't found or the
 * competency has fewer than two moves (nothing to advance to).
 */
export function getNextMove(competency: AtlasCompetency, currentActionId: number): ProMoveDetail | null {
  const moves = competency.proMoves;
  if (moves.length <= 1) return null;
  const idx = moves.findIndex((m) => m.action_id === currentActionId);
  if (idx === -1) return null;
  return moves[(idx + 1) % moves.length];
}

/**
 * Picks a random move's action_id across every loaded competency, for
 * "Surprise me". The trail rebuilds itself from findMoveAncestors once the
 * caller navigates there. Returns null for an empty corpus.
 */
export function pickRandomMoveActionId(competencies: AtlasCompetency[]): number | null {
  const allMoves = competencies.flatMap((c) => c.proMoves);
  if (allMoves.length === 0) return null;
  const idx = Math.floor(Math.random() * allMoves.length);
  return allMoves[idx].action_id;
}
