import { describe, it, expect } from 'vitest';
import { queueTable, getTableCalls } from '@/test/supabaseMock';
import { resolveStatement, fetchContentOverrides } from './contentOverrides';

describe('resolveStatement', () => {
  it('returns the override when one exists for the action id', () => {
    const overrides = new Map([[260, "Confirm tomorrow's schedule with the front desk"]]);
    expect(resolveStatement(260, 'Original platform wording', overrides)).toBe(
      "Confirm tomorrow's schedule with the front desk"
    );
  });

  it('falls back to the platform statement when there is no override', () => {
    const overrides = new Map([[999, 'Unrelated override']]);
    expect(resolveStatement(260, 'Original platform wording', overrides)).toBe('Original platform wording');
  });

  it('falls back to the platform statement when actionId is null or undefined (org-custom / self-select)', () => {
    const overrides = new Map([[260, 'Should not apply']]);
    expect(resolveStatement(null, 'Org custom statement', overrides)).toBe('Org custom statement');
    expect(resolveStatement(undefined, 'Org custom statement', overrides)).toBe('Org custom statement');
  });
});

describe('fetchContentOverrides', () => {
  it('returns an empty map without querying when orgId is missing', async () => {
    const result = await fetchContentOverrides(null, [1, 2]);
    expect(result.size).toBe(0);
    expect(getTableCalls('organization_pro_move_content_overrides')).toEqual([]);
  });

  it('returns an empty map without querying when there are no action ids', async () => {
    const result = await fetchContentOverrides('org-1', []);
    expect(result.size).toBe(0);
    expect(getTableCalls('organization_pro_move_content_overrides')).toEqual([]);
  });

  it('maps pro_move_id to custom_statement for the org, skipping blank overrides', async () => {
    queueTable('organization_pro_move_content_overrides', {
      data: [
        { pro_move_id: 260, custom_statement: "Confirm tomorrow's schedule" },
        { pro_move_id: 261, custom_statement: null },
      ],
      error: null,
    });

    const result = await fetchContentOverrides('org-1', [260, 261]);

    expect(result.get(260)).toBe("Confirm tomorrow's schedule");
    expect(result.has(261)).toBe(false);
    expect(getTableCalls('organization_pro_move_content_overrides')[0].filters).toContainEqual({
      op: 'eq',
      args: ['org_id', 'org-1'],
    });
  });

  it('dedupes and drops nullish action ids before querying', async () => {
    queueTable('organization_pro_move_content_overrides', { data: [], error: null });
    await fetchContentOverrides('org-1', [1, 1, 2, null as unknown as number]);
    const call = getTableCalls('organization_pro_move_content_overrides')[0];
    const inFilter = call.filters.find((f) => f.op === 'in');
    expect(inFilter?.args[1]).toEqual([1, 2]);
  });
});
