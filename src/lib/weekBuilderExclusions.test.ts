import { describe, it, expect } from 'vitest';
import { computeExcludeActionIds } from './weekBuilderExclusions';

describe('computeExcludeActionIds', () => {
  it('returns the action_ids already placed in the week', () => {
    const slots = [{ actionId: 101 }, { actionId: 205 }, { actionId: null }];
    expect(computeExcludeActionIds(slots).sort()).toEqual([101, 205]);
  });

  it('includes a migrated org-custom move — it now has a real action_id like any platform move', () => {
    // Before PML-2a, an org-custom slot had actionId: null and was only
    // addressable via orgMoveId, so it never showed up here. Post-migration
    // it has a real action_id and must be excluded from re-selection.
    const slots = [{ actionId: 900 } /* migrated org-custom move */, { actionId: null }];
    expect(computeExcludeActionIds(slots)).toEqual([900]);
  });

  it('dedupes repeated action_ids', () => {
    const slots = [{ actionId: 1 }, { actionId: 1 }];
    expect(computeExcludeActionIds(slots)).toEqual([1]);
  });

  it('returns an empty array for an all-empty week', () => {
    expect(computeExcludeActionIds([{ actionId: null }, { actionId: null }])).toEqual([]);
  });
});
