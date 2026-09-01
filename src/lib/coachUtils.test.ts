import { describe, it, expect } from 'vitest';
import { aggregateStaffWeekSummary, isCheckedIn, isCheckedOut } from './coachUtils';
import type { RawScoreRow } from '@/types/coachV2';

function row(overrides: Partial<RawScoreRow> = {}): RawScoreRow {
  return {
    staff_id: 's1',
    staff_name: 'Staffer',
    staff_email: 's1@example.com',
    user_id: 'u1',
    role_id: 1,
    role_name: 'RDA',
    location_id: 'loc-1',
    location_name: 'Main St',
    group_id: 'group-1',
    group_name: 'North',
    score_id: 'score-1',
    week_of: '2026-08-31',
    assignment_id: 'assign:a1',
    action_id: 100,
    selected_action_id: null,
    confidence_score: null,
    confidence_date: null,
    confidence_late: null,
    confidence_source: 'live',
    performance_score: null,
    performance_date: null,
    performance_late: null,
    performance_source: 'live',
    action_statement: 'Do the thing',
    domain_id: 1,
    domain_name: 'Clinical',
    display_order: 1,
    self_select: false,
    ...overrides,
  };
}

// The RPC's placeholder row for a staff member with zero submissions: one
// row, every score/assignment field null.
function placeholderRow(staffId: string): RawScoreRow {
  return row({
    staff_id: staffId,
    score_id: null,
    week_of: null,
    assignment_id: null,
    action_id: null,
    confidence_score: null,
    performance_score: null,
    display_order: null,
    self_select: null,
  });
}

describe('aggregateStaffWeekSummary with a required-count resolver (DASH-5)', () => {
  it('a full check-in on all required moves marks the person checked in', () => {
    const rows = [
      row({ score_id: 'sc1', assignment_id: 'assign:a1', confidence_score: 3 }),
      row({ score_id: 'sc2', assignment_id: 'assign:a2', confidence_score: 2 }),
      row({ score_id: 'sc3', assignment_id: 'assign:a3', confidence_score: 4 }),
    ];
    const [summary] = aggregateStaffWeekSummary(rows, '2026-08-31', () => 3);
    expect(summary.required_count).toBe(3);
    expect(summary.conf_required_done).toBe(3);
    expect(isCheckedIn(summary)).toBe(true);
    expect(isCheckedOut(summary)).toBe(false);
  });

  it('a partial check-in (glitch or abandoned mid-submission) is NOT checked in', () => {
    const rows = [
      row({ score_id: 'sc1', assignment_id: 'assign:a1', confidence_score: 3 }),
      row({ score_id: 'sc2', assignment_id: 'assign:a2', confidence_score: 2 }),
    ];
    const [summary] = aggregateStaffWeekSummary(rows, '2026-08-31', () => 3);
    expect(summary.conf_required_done).toBe(2);
    expect(isCheckedIn(summary)).toBe(false);
  });

  it('a zero-submission placeholder row leaves the person owing their full workload, not 1', () => {
    const [summary] = aggregateStaffWeekSummary([placeholderRow('s9')], '2026-08-31', () => 3);
    // The old bug: assignment_count (row count) floored this person at 1.
    expect(summary.assignment_count).toBe(1);
    expect(summary.required_count).toBe(3);
    expect(isCheckedIn(summary)).toBe(false);
  });

  it('self-select scores do not substitute for unrated required moves', () => {
    const rows = [
      row({ score_id: 'sc1', assignment_id: 'assign:a1', confidence_score: 3 }),
      row({ score_id: 'sc2', assignment_id: 'assign:a2', confidence_score: 2, self_select: true }),
    ];
    const [summary] = aggregateStaffWeekSummary(rows, '2026-08-31', () => 2);
    expect(summary.conf_count).toBe(2);
    expect(summary.conf_required_done).toBe(1);
    expect(isCheckedIn(summary)).toBe(false);
  });

  it('checked out requires performance on all required moves, same rule as check-in', () => {
    const rows = [
      row({ score_id: 'sc1', assignment_id: 'assign:a1', confidence_score: 3, performance_score: 3 }),
      row({ score_id: 'sc2', assignment_id: 'assign:a2', confidence_score: 2, performance_score: null }),
    ];
    const [summary] = aggregateStaffWeekSummary(rows, '2026-08-31', () => 2);
    expect(isCheckedIn(summary)).toBe(true);
    expect(isCheckedOut(summary)).toBe(false);
  });

  it('a person with no published assignments can never be checked in or out', () => {
    const [summary] = aggregateStaffWeekSummary([placeholderRow('s9')], '2026-08-31', () => 0);
    expect(summary.required_count).toBe(0);
    expect(isCheckedIn(summary)).toBe(false);
    expect(isCheckedOut(summary)).toBe(false);
  });

  it('without a resolver (weekOf-less callers), required_count stays 0', () => {
    const [summary] = aggregateStaffWeekSummary([row({ confidence_score: 3 })], 'current');
    expect(summary.required_count).toBe(0);
  });
});
