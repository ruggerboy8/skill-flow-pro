import { describe, it, expect } from 'vitest';
import { queueRpc, getRpcCalls } from '@/test/supabaseMock';
import { mapEligibleMoveRow, fetchEligibleProMoves } from './proMoveEligibility';

describe('mapEligibleMoveRow', () => {
  it('marks a row with no owner as a platform move', () => {
    const result = mapEligibleMoveRow({
      action_id: 101,
      action_statement: 'Greet every family by name',
      competency_id: 5,
      role_id: 2,
      practice_types: ['pediatric_us'],
      source: 'platform',
      owner_org_id: null,
    });
    expect(result).toEqual({
      actionId: 101,
      actionStatement: 'Greet every family by name',
      competencyId: 5,
      roleId: 2,
      practiceTypes: ['pediatric_us'],
      source: 'platform',
      ownerOrgId: null,
    });
  });

  it('marks a row with an owner_org_id as org_custom regardless of the raw source column', () => {
    const result = mapEligibleMoveRow({
      action_id: 900,
      action_statement: 'Run the GDC compliance checklist',
      competency_id: null,
      role_id: 3,
      practice_types: ['general_uk'],
      source: 'org_custom',
      owner_org_id: 'org-1',
    });
    expect(result.source).toBe('org_custom');
    expect(result.ownerOrgId).toBe('org-1');
  });

  it('defaults null practice_types to an empty array', () => {
    const result = mapEligibleMoveRow({
      action_id: 1,
      action_statement: 'X',
      competency_id: null,
      role_id: null,
      practice_types: null,
      source: null,
      owner_org_id: null,
    });
    expect(result.practiceTypes).toEqual([]);
  });
});

describe('fetchEligibleProMoves', () => {
  it('calls the org_visible_pro_moves RPC with the org and role, and maps every row', async () => {
    queueRpc('org_visible_pro_moves', {
      data: [
        {
          action_id: 1,
          action_statement: 'Confirm appointments by phone',
          competency_id: 10,
          role_id: 2,
          practice_types: ['pediatric_us'],
          source: 'platform',
          owner_org_id: null,
        },
        {
          action_id: 900,
          action_statement: 'Run the GDC compliance checklist',
          competency_id: null,
          role_id: 2,
          practice_types: ['general_uk'],
          source: 'org_custom',
          owner_org_id: 'org-1',
        },
      ],
      error: null,
    });

    const result = await fetchEligibleProMoves('org-1', 2);

    expect(result).toHaveLength(2);
    expect(result[1].source).toBe('org_custom');
    expect(getRpcCalls('org_visible_pro_moves')).toEqual([
      { name: 'org_visible_pro_moves', args: { p_org_id: 'org-1', p_role_id: 2 } },
    ]);
  });

  it('omits p_role_id when no role is given, so the RPC defaults it to every role', async () => {
    queueRpc('org_visible_pro_moves', { data: [], error: null });

    await fetchEligibleProMoves('org-1');

    expect(getRpcCalls('org_visible_pro_moves')[0].args).toEqual({
      p_org_id: 'org-1',
      p_role_id: undefined,
    });
  });

  it('throws when the RPC errors', async () => {
    queueRpc('org_visible_pro_moves', { data: null, error: { message: 'boom' } });
    await expect(fetchEligibleProMoves('org-1', 1)).rejects.toEqual({ message: 'boom' });
  });
});
