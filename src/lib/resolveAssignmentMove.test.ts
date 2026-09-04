import { describe, it, expect } from 'vitest';
import {
  resolveAssignmentRows,
  collectOrgMoveIds,
  type AssignmentRowForResolve,
} from './resolveAssignmentMove';

describe('resolveAssignmentRows', () => {
  it('resolves a platform move via the nested pro_moves competency/domain path', () => {
    const rows: AssignmentRowForResolve[] = [
      {
        id: 'a1',
        display_order: 1,
        self_select: false,
        pro_moves: {
          action_statement: 'Confirm tomorrow\'s appointments by phone',
          intervention_text: 'Call by 4pm',
          competencies: { domains: { domain_name: 'Clerical' } },
        },
      },
    ];
    const result = resolveAssignmentRows(rows, new Map());
    expect(result).toEqual([
      {
        weekly_focus_id: 'assign:a1',
        type: 'site',
        display_order: 1,
        action_statement: 'Confirm tomorrow\'s appointments by phone',
        domain_name: 'Clerical',
        intervention_text: 'Call by 4pm',
        required: true,
        locked: false,
      },
    ]);
  });

  it('falls back to the top-level competencies.domains path when pro_moves has none', () => {
    const rows: AssignmentRowForResolve[] = [
      {
        id: 'a2',
        display_order: 2,
        pro_moves: { action_statement: 'Do the thing' },
        competencies: { domains: { domain_name: 'Clinical' } },
      },
    ];
    const result = resolveAssignmentRows(rows, new Map());
    expect(result[0].domain_name).toBe('Clinical');
    expect(result[0].action_statement).toBe('Do the thing');
  });

  it('resolves an org custom move (the live-bug case) instead of rendering blank', () => {
    const rows: AssignmentRowForResolve[] = [
      { id: 'a3', display_order: 1, org_move_id: 'org-move-uuid' },
    ];
    const orgMeta = new Map([
      ['org-move-uuid', { statement: 'Log every no-show in the huddle sheet', domain: 'Cultural' }],
    ]);
    const result = resolveAssignmentRows(rows, orgMeta);
    expect(result).toEqual([
      {
        weekly_focus_id: 'assign:a3',
        type: 'site',
        display_order: 1,
        action_statement: 'Log every no-show in the huddle sheet',
        domain_name: 'Cultural',
        intervention_text: null,
        required: true,
        locked: false,
      },
    ]);
  });

  it('degrades gracefully when an org_move_id has no matching meta entry', () => {
    const rows: AssignmentRowForResolve[] = [
      { id: 'a4', display_order: 1, org_move_id: 'missing-uuid' },
    ];
    const result = resolveAssignmentRows(rows, new Map());
    expect(result[0].action_statement).toBe('');
    expect(result[0].domain_name).toBe('Unknown');
  });

  it('maps self_select to the self_select type and defaults to site otherwise', () => {
    const rows: AssignmentRowForResolve[] = [
      { id: 'a5', display_order: 1, self_select: true },
      { id: 'a6', display_order: 2, self_select: false },
      { id: 'a7', display_order: 3 },
    ];
    const result = resolveAssignmentRows(rows, new Map());
    expect(result.map((r) => r.type)).toEqual(['self_select', 'site', 'site']);
  });

  it('prefers the org move even if a stale pro_moves embed is also present', () => {
    const rows: AssignmentRowForResolve[] = [
      {
        id: 'a8',
        display_order: 1,
        org_move_id: 'org-move-uuid',
        pro_moves: { action_statement: 'Should not be used', competencies: { domains: { domain_name: 'Clinical' } } },
      },
    ];
    const orgMeta = new Map([
      ['org-move-uuid', { statement: 'Org statement wins', domain: 'Cultural' }],
    ]);
    const result = resolveAssignmentRows(rows, orgMeta);
    expect(result[0].action_statement).toBe('Org statement wins');
    expect(result[0].domain_name).toBe('Cultural');
  });
});

describe('resolveAssignmentRows: content overrides (PML-2b)', () => {
  it('shows the org override statement instead of the platform statement when one exists', () => {
    const rows: AssignmentRowForResolve[] = [
      {
        id: 'a9',
        display_order: 1,
        action_id: 260,
        pro_moves: {
          action_statement: 'Original platform wording',
          competencies: { domains: { domain_name: 'Clerical' } },
        },
      },
    ];
    const overrides = new Map([[260, "Confirm tomorrow's schedule with the front desk"]]);
    const result = resolveAssignmentRows(rows, new Map(), overrides);
    expect(result[0].action_statement).toBe("Confirm tomorrow's schedule with the front desk");
  });

  it('falls back to the platform statement when no override exists for that action_id', () => {
    const rows: AssignmentRowForResolve[] = [
      {
        id: 'a10',
        display_order: 1,
        action_id: 999,
        pro_moves: { action_statement: 'Original platform wording' },
      },
    ];
    const overrides = new Map([[260, 'Unrelated override']]);
    const result = resolveAssignmentRows(rows, new Map(), overrides);
    expect(result[0].action_statement).toBe('Original platform wording');
  });

  it('never applies an override to an org-custom move, even if its action_id happens to collide', () => {
    const rows: AssignmentRowForResolve[] = [
      { id: 'a11', display_order: 1, org_move_id: 'org-move-uuid', action_id: null },
    ];
    const orgMeta = new Map([['org-move-uuid', { statement: 'Org custom wording', domain: 'Cultural' }]]);
    const overrides = new Map([[260, 'Should never apply']]);
    const result = resolveAssignmentRows(rows, orgMeta, overrides);
    expect(result[0].action_statement).toBe('Org custom wording');
  });

  it('defaults to no overrides when the third argument is omitted (backward compatible)', () => {
    const rows: AssignmentRowForResolve[] = [
      { id: 'a12', display_order: 1, action_id: 260, pro_moves: { action_statement: 'Platform wording' } },
    ];
    const result = resolveAssignmentRows(rows, new Map());
    expect(result[0].action_statement).toBe('Platform wording');
  });
});

describe('collectOrgMoveIds', () => {
  it('returns an empty array when no row has an org_move_id', () => {
    const rows: AssignmentRowForResolve[] = [{ id: 'a1', display_order: 1 }];
    expect(collectOrgMoveIds(rows)).toEqual([]);
  });

  it('dedupes org_move_ids across rows and drops nulls', () => {
    const rows: AssignmentRowForResolve[] = [
      { id: 'a1', display_order: 1, org_move_id: 'x' },
      { id: 'a2', display_order: 2, org_move_id: 'x' },
      { id: 'a3', display_order: 3, org_move_id: 'y' },
      { id: 'a4', display_order: 4, org_move_id: null },
    ];
    expect(collectOrgMoveIds(rows).sort()).toEqual(['x', 'y']);
  });
});
