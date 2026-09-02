import { describe, it, expect, vi, afterEach } from 'vitest';
import { findMoveAncestors, getNextMove, pickRandomMoveActionId } from './exploreNav';
import type { AtlasCompetency } from '@/hooks/useCraftAtlas';
import type { ProMoveDetail } from '@/hooks/useDomainDetail';

function move(action_id: number, action_statement = `Move ${action_id}`): ProMoveDetail {
  return { action_id, action_statement, lastPracticed: null, avgConfidence: null };
}

function competency(overrides: Partial<AtlasCompetency> & { competency_id: number }): AtlasCompetency {
  return {
    competency_id: overrides.competency_id,
    domainId: overrides.domainId ?? 1,
    domainName: overrides.domainName ?? 'Clinical',
    title: overrides.title ?? 'Untitled competency',
    subtitle: overrides.subtitle ?? null,
    friendlyDescription: overrides.friendlyDescription ?? null,
    formalDescription: overrides.formalDescription ?? null,
    observerScore: overrides.observerScore ?? null,
    observerNote: overrides.observerNote ?? null,
    proMoves: overrides.proMoves ?? [],
  };
}

describe('findMoveAncestors', () => {
  it('finds the competency that owns the move', () => {
    const target = move(2);
    const corpus = [
      competency({ competency_id: 1, title: 'A', proMoves: [move(1)] }),
      competency({ competency_id: 2, title: 'B', proMoves: [target, move(3)] }),
    ];
    const result = findMoveAncestors(corpus, 2);
    expect(result?.competency.competency_id).toBe(2);
    expect(result?.move).toBe(target);
  });

  it('returns null when the action_id is not found anywhere', () => {
    const corpus = [competency({ competency_id: 1, proMoves: [move(1)] })];
    expect(findMoveAncestors(corpus, 999)).toBeNull();
  });

  it('returns null for an empty corpus', () => {
    expect(findMoveAncestors([], 1)).toBeNull();
  });
});

describe('getNextMove', () => {
  it('advances to the next move in order', () => {
    const comp = competency({ competency_id: 1, proMoves: [move(1), move(2), move(3)] });
    expect(getNextMove(comp, 1)?.action_id).toBe(2);
    expect(getNextMove(comp, 2)?.action_id).toBe(3);
  });

  it('wraps around at the end of the competency', () => {
    const comp = competency({ competency_id: 1, proMoves: [move(1), move(2), move(3)] });
    expect(getNextMove(comp, 3)?.action_id).toBe(1);
  });

  it('returns null when the competency has only one move', () => {
    const comp = competency({ competency_id: 1, proMoves: [move(1)] });
    expect(getNextMove(comp, 1)).toBeNull();
  });

  it('returns null when the competency has no moves', () => {
    const comp = competency({ competency_id: 1, proMoves: [] });
    expect(getNextMove(comp, 1)).toBeNull();
  });

  it('returns null when the current action_id is not in this competency', () => {
    const comp = competency({ competency_id: 1, proMoves: [move(1), move(2)] });
    expect(getNextMove(comp, 999)).toBeNull();
  });
});

describe('pickRandomMoveActionId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for an empty corpus', () => {
    expect(pickRandomMoveActionId([])).toBeNull();
  });

  it('returns null when every competency has zero moves', () => {
    const corpus = [competency({ competency_id: 1, proMoves: [] })];
    expect(pickRandomMoveActionId(corpus)).toBeNull();
  });

  it('picks a move action_id from across all competencies', () => {
    const corpus = [
      competency({ competency_id: 1, proMoves: [move(1), move(2)] }),
      competency({ competency_id: 2, proMoves: [move(3)] }),
    ];
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    // 3 total moves, floor(0.99 * 3) = 2 -> the third move (index 2), action_id 3.
    expect(pickRandomMoveActionId(corpus)).toBe(3);
  });

  it('picks the first move when Math.random returns 0', () => {
    const corpus = [competency({ competency_id: 1, proMoves: [move(5), move(6)] })];
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickRandomMoveActionId(corpus)).toBe(5);
  });
});
