import { describe, it, expect } from 'vitest';
import {
  explorationStorageKey,
  readExploredIds,
  writeExploredIds,
  markMoveExplored,
  countExplored,
  type KeyValueStorage,
} from './exploredMovesStore';

/** In-memory fake so these tests don't depend on jsdom's localStorage state. */
function fakeStorage(initial: Record<string, string> = {}): KeyValueStorage {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe('explorationStorageKey', () => {
  it('namespaces the key per staff id', () => {
    expect(explorationStorageKey('staff-1')).toBe('explore:opened:staff-1');
    expect(explorationStorageKey('staff-2')).toBe('explore:opened:staff-2');
  });
});

describe('readExploredIds', () => {
  it('returns [] when nothing is stored', () => {
    expect(readExploredIds('staff-1', fakeStorage())).toEqual([]);
  });

  it('returns the stored ids', () => {
    const storage = fakeStorage({ 'explore:opened:staff-1': JSON.stringify([1, 2, 3]) });
    expect(readExploredIds('staff-1', storage)).toEqual([1, 2, 3]);
  });

  it('returns [] for malformed JSON instead of throwing', () => {
    const storage = fakeStorage({ 'explore:opened:staff-1': '{not json' });
    expect(readExploredIds('staff-1', storage)).toEqual([]);
  });

  it('returns [] when the stored value is not an array', () => {
    const storage = fakeStorage({ 'explore:opened:staff-1': JSON.stringify({ foo: 'bar' }) });
    expect(readExploredIds('staff-1', storage)).toEqual([]);
  });

  it('filters out non-number entries', () => {
    const storage = fakeStorage({ 'explore:opened:staff-1': JSON.stringify([1, 'two', 3, null]) });
    expect(readExploredIds('staff-1', storage)).toEqual([1, 3]);
  });

  it('is scoped per staff id — one staff cannot read another\'s set', () => {
    const storage = fakeStorage({ 'explore:opened:staff-1': JSON.stringify([1, 2]) });
    expect(readExploredIds('staff-2', storage)).toEqual([]);
  });
});

describe('writeExploredIds / readExploredIds round-trip', () => {
  it('persists and reads back the same ids', () => {
    const storage = fakeStorage();
    writeExploredIds('staff-1', [7, 8, 9], storage);
    expect(readExploredIds('staff-1', storage)).toEqual([7, 8, 9]);
  });

  it('does not throw when storage.setItem throws (quota / private mode)', () => {
    const storage: KeyValueStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => writeExploredIds('staff-1', [1], storage)).not.toThrow();
  });
});

describe('markMoveExplored', () => {
  it('adds a new action_id to an empty set', () => {
    const storage = fakeStorage();
    const result = markMoveExplored('staff-1', 42, storage);
    expect(result).toEqual([42]);
    expect(readExploredIds('staff-1', storage)).toEqual([42]);
  });

  it('appends to an existing set', () => {
    const storage = fakeStorage({ 'explore:opened:staff-1': JSON.stringify([1, 2]) });
    const result = markMoveExplored('staff-1', 3, storage);
    expect(result).toEqual([1, 2, 3]);
  });

  it('is idempotent — marking the same move twice does not duplicate it', () => {
    const storage = fakeStorage();
    markMoveExplored('staff-1', 5, storage);
    const result = markMoveExplored('staff-1', 5, storage);
    expect(result).toEqual([5]);
  });
});

describe('countExplored', () => {
  it('counts how many of a list of actionIds are in the explored set', () => {
    expect(countExplored([1, 2, 3], [2, 3, 4])).toBe(2);
  });

  it('returns 0 when nothing overlaps', () => {
    expect(countExplored([1, 2], [3, 4])).toBe(0);
  });

  it('returns 0 for an empty actionIds list', () => {
    expect(countExplored([1, 2], [])).toBe(0);
  });

  it('returns 0 for an empty explored set', () => {
    expect(countExplored([], [1, 2])).toBe(0);
  });
});
