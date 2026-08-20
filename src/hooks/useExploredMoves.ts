import { useCallback, useEffect, useState } from 'react';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { readExploredIds, markMoveExplored, countExplored } from '@/lib/exploredMovesStore';

/**
 * Per-device discovery-dots tracker for the Explore drill (see
 * docs/specs/mob-explore-rebuild.md §5). Backed by localStorage, keyed by
 * staff id — no DB write, no cross-device sync. `markOpened` is called once
 * on ExploreMove mount; competency rows on the domain page use `countFor` to
 * render "N opened" dots. The pure read/write/mark logic lives in
 * src/lib/exploredMovesStore.ts so it's unit-tested without React.
 */
export function useExploredMoves() {
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const staffId = staffProfile?.id ?? null;
  const [exploredIds, setExploredIds] = useState<number[]>([]);

  useEffect(() => {
    if (!staffId || typeof window === 'undefined') {
      setExploredIds([]);
      return;
    }
    setExploredIds(readExploredIds(staffId, window.localStorage));
  }, [staffId]);

  const markOpened = useCallback(
    (actionId: number) => {
      if (!staffId || typeof window === 'undefined') return;
      setExploredIds(markMoveExplored(staffId, actionId, window.localStorage));
    },
    [staffId]
  );

  const has = useCallback((actionId: number) => exploredIds.includes(actionId), [exploredIds]);

  const countFor = useCallback((actionIds: number[]) => countExplored(exploredIds, actionIds), [exploredIds]);

  return { has, markOpened, countFor };
}
