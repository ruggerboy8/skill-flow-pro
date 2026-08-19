import { describe, it, expect } from 'vitest';
import {
  buildDemoAssignmentDraft,
  buildDemoScoreDraft,
  clearCurrentWeekScore,
  type SourceAssignmentRow,
  type SourceScoreRow,
  type DemoScoreDraft,
} from './rowBuilders';

describe('buildDemoAssignmentDraft', () => {
  const source: SourceAssignmentRow = {
    role_id: 3,
    week_start_date: '2026-08-10',
    display_order: 1,
    action_id: 501,
    competency_id: 12,
    self_select: false,
  };

  it('points at the demo org and location, keeping the role/week/slot structure', () => {
    const draft = buildDemoAssignmentDraft(source, 'org-bluebird', 'loc-bluebird-1');
    expect(draft.org_id).toBe('org-bluebird');
    expect(draft.location_id).toBe('loc-bluebird-1');
    expect(draft.role_id).toBe(3);
    expect(draft.week_start_date).toBe('2026-08-10');
    expect(draft.display_order).toBe(1);
    expect(draft.action_id).toBe(501);
  });

  it('always stamps source as demo-seed, regardless of the original source value', () => {
    const draft = buildDemoAssignmentDraft(source, 'org-bluebird', 'loc-bluebird-1');
    expect(draft.source).toBe('demo-seed');
  });

  it('always forces status to locked, since SourceAssignmentRow does not even carry a status field', () => {
    // The type itself proves the point: buildDemoAssignmentDraft has no
    // source status to read from, so there is no way for a draft/other
    // status to leak through. This is the fix for the bug where a copied
    // 'draft' row was invisible to every app read path (they all filter
    // on status = 'locked': locationState.ts, useWeeklyAssignments,
    // ConfidenceWizard, PerformanceWizard, MonthView,
    // GlobalAssignmentBuilder, TeamWeeklyFocus).
    const draft = buildDemoAssignmentDraft(source, 'org-bluebird', 'loc-bluebird-1');
    expect(draft.status).toBe('locked');
  });

  it('forces status locked for every demo location the source row is replicated to', () => {
    const a = buildDemoAssignmentDraft(source, 'org-bluebird', 'loc-1');
    const b = buildDemoAssignmentDraft(source, 'org-bluebird', 'loc-2');
    const c = buildDemoAssignmentDraft(source, 'org-bluebird', 'loc-3');
    expect([a.status, b.status, c.status]).toEqual(['locked', 'locked', 'locked']);
  });

  it('produces one independent draft per demo location for the same source row', () => {
    const a = buildDemoAssignmentDraft(source, 'org-bluebird', 'loc-1');
    const b = buildDemoAssignmentDraft(source, 'org-bluebird', 'loc-2');
    expect(a.location_id).not.toBe(b.location_id);
    expect(a.action_id).toBe(b.action_id); // same Pro Move, replicated
  });
});

describe('buildDemoScoreDraft', () => {
  const source: SourceScoreRow = {
    confidence_score: 3,
    confidence_date: '2026-08-11',
    confidence_late: false,
    performance_score: 4,
    performance_date: '2026-08-14',
    performance_late: false,
    week_of: '2026-08-10',
  };

  it('always marks copied history as backfill_historical, never live', () => {
    const draft = buildDemoScoreDraft(source, 'staff-demo-1', 'assign-uuid-1', 501);
    expect(draft.confidence_source).toBe('backfill_historical');
    expect(draft.performance_source).toBe('backfill_historical');
  });

  it('self-enters on behalf of the demo staff member, not any copied entered_by', () => {
    const draft = buildDemoScoreDraft(source, 'staff-demo-1', 'assign-uuid-1', 501);
    expect(draft.entered_by).toBe('staff-demo-1');
    expect(draft.staff_id).toBe('staff-demo-1');
  });

  it('prefixes the assignment id with "assign:" per the app\'s convention', () => {
    const draft = buildDemoScoreDraft(source, 'staff-demo-1', 'assign-uuid-1', 501);
    expect(draft.assignment_id).toBe('assign:assign-uuid-1');
  });

  it('carries the numeric/date fields through unchanged', () => {
    const draft = buildDemoScoreDraft(source, 'staff-demo-1', 'assign-uuid-1', 501);
    expect(draft.confidence_score).toBe(3);
    expect(draft.performance_score).toBe(4);
    expect(draft.week_of).toBe('2026-08-10');
  });
});

describe('clearCurrentWeekScore', () => {
  const rows: DemoScoreDraft[] = [
    {
      staff_id: 'staff-demo-1',
      assignment_id: 'assign:a1',
      entered_by: 'staff-demo-1',
      confidence_score: 3,
      confidence_date: '2026-08-11',
      confidence_late: false,
      confidence_source: 'backfill_historical',
      performance_score: 4,
      performance_date: '2026-08-14',
      performance_late: false,
      performance_source: 'backfill_historical',
      week_of: '2026-08-10',
      site_action_id: 501,
      selected_action_id: 501,
    },
    {
      staff_id: 'staff-demo-2',
      assignment_id: 'assign:a2',
      entered_by: 'staff-demo-2',
      confidence_score: 2,
      confidence_date: '2026-08-11',
      confidence_late: false,
      confidence_source: 'backfill_historical',
      performance_score: 2,
      performance_date: '2026-08-14',
      performance_late: false,
      performance_source: 'backfill_historical',
      week_of: '2026-08-10',
      site_action_id: 502,
      selected_action_id: 502,
    },
  ];

  it('nulls out only the targeted staff member\'s current-week scores', () => {
    const cleared = clearCurrentWeekScore(rows, 'staff-demo-1', '2026-08-10');
    expect(cleared[0].confidence_score).toBeNull();
    expect(cleared[0].performance_score).toBeNull();
    expect(cleared[0].confidence_date).toBeNull();
    expect(cleared[0].performance_date).toBeNull();
  });

  it('leaves every other staff member\'s scores untouched', () => {
    const cleared = clearCurrentWeekScore(rows, 'staff-demo-1', '2026-08-10');
    expect(cleared[1]).toEqual(rows[1]);
  });

  it('leaves a different week for the same staff member untouched', () => {
    const cleared = clearCurrentWeekScore(rows, 'staff-demo-1', '2026-08-17');
    expect(cleared[0]).toEqual(rows[0]);
  });

  it('does not mutate the input array', () => {
    const before = JSON.parse(JSON.stringify(rows));
    clearCurrentWeekScore(rows, 'staff-demo-1', '2026-08-10');
    expect(rows).toEqual(before);
  });
});
