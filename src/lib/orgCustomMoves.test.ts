import { describe, it, expect } from 'vitest';
import { queueTable, getTableCalls } from '@/test/supabaseMock';
import {
  mapOrgCustomMoveRow,
  fetchOrgCustomMoves,
  updateOrgCustomMove,
  deactivateOrgCustomMove,
} from './orgCustomMoves';

describe('mapOrgCustomMoveRow', () => {
  it('maps a pro_moves row (post-fold or newly created) with a numeric actionId', () => {
    const result = mapOrgCustomMoveRow(
      {
        id: 900,
        action_statement: 'Run the GDC compliance checklist',
        description: 'Weekly, before Friday close',
        role_id: 3,
        competency_id: 40,
        practice_types: ['general_uk'],
        roles: { role_name: 'Office Manager' },
        competencies: { name: 'Compliance', domains: { domain_name: 'Clerical' } },
      },
      'pro_moves'
    );
    expect(result).toEqual({
      key: 'pro_moves-900',
      source: 'pro_moves',
      actionId: 900,
      legacyId: null,
      actionStatement: 'Run the GDC compliance checklist',
      description: 'Weekly, before Friday close',
      roleId: 3,
      roleName: 'Office Manager',
      competencyId: 40,
      competencyName: 'Compliance',
      domainName: 'Clerical',
      practiceTypes: ['general_uk'],
    });
  });

  it('maps an organization_pro_moves row (not yet migrated) with a string legacyId', () => {
    const result = mapOrgCustomMoveRow(
      {
        id: 'uuid-abc',
        action_statement: 'Log every no-show in the huddle sheet',
        description: null,
        role_id: null,
        competency_id: null,
        practice_types: [],
        roles: null,
        competencies: null,
      },
      'organization_pro_moves'
    );
    expect(result.source).toBe('organization_pro_moves');
    expect(result.actionId).toBeNull();
    expect(result.legacyId).toBe('uuid-abc');
    expect(result.roleName).toBe('—');
    expect(result.domainName).toBe('—');
  });
});

describe('fetchOrgCustomMoves', () => {
  it('merges migrated (pro_moves) and not-yet-migrated (organization_pro_moves) rows, sorted by statement', async () => {
    queueTable('pro_moves', {
      data: [
        {
          action_id: 900,
          action_statement: 'Z last alphabetically',
          description: null,
          role_id: 1,
          competency_id: 1,
          practice_types: ['general_uk'],
          roles: { role_name: 'RDA' },
          competencies: { name: 'X', domains: { domain_name: 'Clinical' } },
        },
      ],
      error: null,
    });
    queueTable('organization_pro_moves', {
      data: [
        {
          id: 'uuid-1',
          action_statement: 'A first alphabetically',
          description: null,
          role_id: 1,
          competency_id: 1,
          practice_types: ['general_uk'],
          roles: { role_name: 'RDA' },
          competencies: { name: 'Y', domains: { domain_name: 'Cultural' } },
        },
      ],
      error: null,
    });

    const result = await fetchOrgCustomMoves('org-1');

    expect(result.map((r) => r.key)).toEqual(['organization_pro_moves-uuid-1', 'pro_moves-900']);

    const proMovesCall = getTableCalls('pro_moves')[0];
    expect(proMovesCall.filters).toContainEqual({ op: 'eq', args: ['owner_org_id', 'org-1'] });
    expect(proMovesCall.filters).toContainEqual({ op: 'eq', args: ['active', true] });

    const legacyCall = getTableCalls('organization_pro_moves')[0];
    expect(legacyCall.filters).toContainEqual({ op: 'eq', args: ['org_id', 'org-1'] });
    expect(legacyCall.filters).toContainEqual({ op: 'is', args: ['migrated_action_id', null] });
  });

  it('returns only pro_moves rows once every legacy row has migrated_action_id set (the query itself excludes them)', async () => {
    queueTable('pro_moves', {
      data: [
        {
          action_id: 900,
          action_statement: 'Only survivor',
          description: null,
          role_id: null,
          competency_id: null,
          practice_types: [],
          roles: null,
          competencies: null,
        },
      ],
      error: null,
    });
    queueTable('organization_pro_moves', { data: [], error: null });

    const result = await fetchOrgCustomMoves('org-1');
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe('pro_moves');
  });
});

describe('updateOrgCustomMove', () => {
  it('updates pro_moves by action_id when the row lives there', async () => {
    queueTable('pro_moves', { data: null, error: null });
    await updateOrgCustomMove(
      { source: 'pro_moves', actionId: 900, legacyId: null },
      { actionStatement: 'New statement', description: 'New description' }
    );
    const call = getTableCalls('pro_moves')[0];
    expect(call.method).toBe('update');
    expect(call.payload).toEqual({ action_statement: 'New statement', description: 'New description' });
    expect(call.filters).toContainEqual({ op: 'eq', args: ['action_id', 900] });
  });

  it('updates organization_pro_moves by id when the row lives there', async () => {
    queueTable('organization_pro_moves', { data: null, error: null });
    await updateOrgCustomMove(
      { source: 'organization_pro_moves', actionId: null, legacyId: 'uuid-1' },
      { actionStatement: 'New statement', description: null }
    );
    const call = getTableCalls('organization_pro_moves')[0];
    expect(call.method).toBe('update');
    expect(call.filters).toContainEqual({ op: 'eq', args: ['id', 'uuid-1'] });
  });
});

describe('deactivateOrgCustomMove', () => {
  it('sets active=false on pro_moves when the row lives there', async () => {
    queueTable('pro_moves', { data: null, error: null });
    await deactivateOrgCustomMove({ source: 'pro_moves', actionId: 900, legacyId: null });
    const call = getTableCalls('pro_moves')[0];
    expect(call.payload).toEqual({ active: false });
    expect(call.filters).toContainEqual({ op: 'eq', args: ['action_id', 900] });
  });

  it('sets active=false on organization_pro_moves when the row lives there', async () => {
    queueTable('organization_pro_moves', { data: null, error: null });
    await deactivateOrgCustomMove({ source: 'organization_pro_moves', actionId: null, legacyId: 'uuid-1' });
    const call = getTableCalls('organization_pro_moves')[0];
    expect(call.payload).toEqual({ active: false });
    expect(call.filters).toContainEqual({ op: 'eq', args: ['id', 'uuid-1'] });
  });
});
