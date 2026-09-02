import { describe, it, expect } from 'vitest';
import { groupResourceTypesByAction } from './proMoveResourceTypes';

describe('groupResourceTypesByAction', () => {
  it('returns an empty object for an empty rowset', () => {
    expect(groupResourceTypesByAction([])).toEqual({});
  });

  it('groups a single row', () => {
    const result = groupResourceTypesByAction([{ action_id: 1, type: 'script' }]);
    expect(result[1]).toEqual(new Set(['script']));
  });

  it('collects multiple types for the same action_id', () => {
    const result = groupResourceTypesByAction([
      { action_id: 1, type: 'script' },
      { action_id: 1, type: 'audio' },
    ]);
    expect(result[1]).toEqual(new Set(['script', 'audio']));
  });

  it('deduplicates repeated (action_id, type) rows', () => {
    const result = groupResourceTypesByAction([
      { action_id: 1, type: 'script' },
      { action_id: 1, type: 'script' },
    ]);
    expect(result[1]).toEqual(new Set(['script']));
  });

  it('keeps different action_ids separate', () => {
    const result = groupResourceTypesByAction([
      { action_id: 1, type: 'script' },
      { action_id: 2, type: 'video' },
    ]);
    expect(result[1]).toEqual(new Set(['script']));
    expect(result[2]).toEqual(new Set(['video']));
    expect(result[1]).not.toBe(result[2]);
  });

  it('an action_id with no rows is simply absent from the map', () => {
    const result = groupResourceTypesByAction([{ action_id: 1, type: 'script' }]);
    expect(result[999]).toBeUndefined();
  });
});
