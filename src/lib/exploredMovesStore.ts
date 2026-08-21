/**
 * Pure persistence layer for the Explore drill's discovery dots — per-device
 * localStorage, keyed by staff id, no DB write and no cross-device sync (see
 * docs/specs/mob-explore-rebuild.md §5). Storage access is parameterized
 * behind a minimal KeyValueStorage so the read/write/mark logic is fully
 * unit-testable without a browser; src/hooks/useExploredMoves.ts is the thin
 * React wrapper that passes window.localStorage.
 */

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function explorationStorageKey(staffId: string): string {
  return `explore:opened:${staffId}`;
}

/** Reads the set of explored action_ids for a staff member. Never throws. */
export function readExploredIds(staffId: string, storage: KeyValueStorage): number[] {
  try {
    const raw = storage.getItem(explorationStorageKey(staffId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === 'number');
  } catch {
    return [];
  }
}

/** Writes the set of explored action_ids. Degrades silently (private mode / quota). */
export function writeExploredIds(staffId: string, ids: number[], storage: KeyValueStorage): void {
  try {
    storage.setItem(explorationStorageKey(staffId), JSON.stringify(ids));
  } catch {
    // localStorage unavailable — dots just won't persist this session.
  }
}

/** Adds one action_id to the explored set (no-op if already present) and returns the new set. */
export function markMoveExplored(staffId: string, actionId: number, storage: KeyValueStorage): number[] {
  const current = readExploredIds(staffId, storage);
  if (current.includes(actionId)) return current;
  const next = [...current, actionId];
  writeExploredIds(staffId, next, storage);
  return next;
}

/** Count of actionIds present in exploredIds — powers the competency-row "N opened" dots. */
export function countExplored(exploredIds: number[], actionIds: number[]): number {
  const set = new Set(exploredIds);
  return actionIds.filter((id) => set.has(id)).length;
}
