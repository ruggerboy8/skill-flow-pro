import { describe, it, expect } from 'vitest';
import { calculateMissingCounts, calculateLocationStats, type SubmissionGates } from './submissionStatus';
import type { StaffWeekSummary } from '@/types/coachV2';

function week(overrides: Partial<StaffWeekSummary> = {}): StaffWeekSummary {
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
    week_of: '2026-08-10',
    assignment_count: 2,
    conf_count: 0,
    perf_count: 0,
    has_any_late: false,
    is_complete: false,
    scores: [],
    ...overrides,
  };
}

const noGates: SubmissionGates = {
  isPastConfidenceDeadline: false,
  isPastPerformanceDeadline: false,
  isPerformanceOpen: false,
};

describe('calculateMissingCounts', () => {
  it('counts nobody as missing before the confidence deadline has passed', () => {
    const staff = [week({ conf_count: 0, assignment_count: 2 })];
    const result = calculateMissingCounts(staff, { ...noGates });
    expect(result.missingConfCount).toBe(0);
    expect(result.missingPerfCount).toBe(0);
  });

  it('counts a staff member as missing confidence once the confidence deadline has passed', () => {
    const staff = [week({ conf_count: 0, assignment_count: 2 })];
    const result = calculateMissingCounts(staff, {
      ...noGates,
      isPastConfidenceDeadline: true,
    });
    expect(result.missingConfCount).toBe(1);
  });

  it('does not count a staff member as missing confidence if they submitted all of it, even past deadline', () => {
    const staff = [week({ conf_count: 2, assignment_count: 2 })];
    const result = calculateMissingCounts(staff, {
      ...noGates,
      isPastConfidenceDeadline: true,
    });
    expect(result.missingConfCount).toBe(0);
  });

  it('counts performance missing only once the performance deadline has passed', () => {
    const staff = [week({ perf_count: 0, assignment_count: 2 })];
    const before = calculateMissingCounts(staff, { ...noGates, isPastPerformanceDeadline: false });
    const after = calculateMissingCounts(staff, { ...noGates, isPastPerformanceDeadline: true });
    expect(before.missingPerfCount).toBe(0);
    expect(after.missingPerfCount).toBe(1);
  });
});

describe('calculateLocationStats', () => {
  it('rate is 100% before any deadline has passed, even with zero submissions (nothing is due yet)', () => {
    const staff = [week({ conf_count: 0, perf_count: 0, assignment_count: 2 })];
    const result = calculateLocationStats(staff, { ...noGates });
    expect(result.submissionRate).toBe(100);
    expect(result.missingConfCount).toBe(0);
    expect(result.pendingConfCount).toBe(1);
  });

  it('rate drops to reflect missed confidence the moment the confidence deadline passes', () => {
    const staff = [week({ conf_count: 0, perf_count: 0, assignment_count: 2 })];
    const result = calculateLocationStats(staff, {
      ...noGates,
      isPastConfidenceDeadline: true,
    });
    // Only confidence counts toward the denominator so far: 0 of 2 submitted.
    expect(result.submissionRate).toBe(0);
    expect(result.missingConfCount).toBe(1);
    expect(result.pendingConfCount).toBe(0); // no longer "pending" once past deadline, it's missing
  });

  it('a full house (everyone submitted on time) shows 100% after both deadlines pass', () => {
    const staff = [
      week({ conf_count: 2, perf_count: 2, assignment_count: 2 }),
      week({ staff_id: 's2', conf_count: 2, perf_count: 2, assignment_count: 2 }),
    ];
    const result = calculateLocationStats(staff, {
      isPastConfidenceDeadline: true,
      isPastPerformanceDeadline: true,
      isPerformanceOpen: true,
    });
    expect(result.submissionRate).toBe(100);
    expect(result.missingConfCount).toBe(0);
    expect(result.missingPerfCount).toBe(0);
  });

  it('combines confidence and performance into one blended rate once both deadlines have passed', () => {
    // 1 staff, 2 assignments: confidence fully submitted (2/2), performance half submitted (1/2).
    // Required = 2 (conf) + 2 (perf) = 4. Submitted = 2 (conf) + 1 (perf) = 3. Rate = 75%.
    const staff = [week({ conf_count: 2, perf_count: 1, assignment_count: 2 })];
    const result = calculateLocationStats(staff, {
      isPastConfidenceDeadline: true,
      isPastPerformanceDeadline: true,
      isPerformanceOpen: true,
    });
    expect(result.submissionRate).toBe(75);
    expect(result.missingPerfCount).toBe(1);
  });

  it('averages confidence and performance scores only over scores that were actually entered', () => {
    const staff = [
      week({
        scores: [
          { confidence_score: 3, performance_score: null } as any,
          { confidence_score: null, performance_score: 4 } as any,
        ],
      }),
    ];
    const result = calculateLocationStats(staff, { ...noGates });
    expect(result.avgConfidence).toBe(3);
    expect(result.avgPerformance).toBe(4);
  });
});
