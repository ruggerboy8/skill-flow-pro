import { describe, expect, it } from 'vitest';
import { wrapupComparator, midweekComparator } from './dashboardGridSort';

describe('wrapupComparator', () => {
  it('sorts ascending by submission rate, worst first', () => {
    const list = [
      { submissionRate: 90 },
      { submissionRate: 40 },
      { submissionRate: 70 },
    ];
    const sorted = [...list].sort(wrapupComparator);
    expect(sorted.map(s => s.submissionRate)).toEqual([40, 70, 90]);
  });

  it('is a stable no-op comparator on ties (does not assert a tiebreak)', () => {
    const list = [
      { submissionRate: 50 },
      { submissionRate: 50 },
    ];
    const sorted = [...list].sort(wrapupComparator);
    expect(sorted.map(s => s.submissionRate)).toEqual([50, 50]);
  });
});

describe('midweekComparator', () => {
  const at = (isoTime: string) => new Date(`2026-08-25T${isoTime}Z`);

  it('sorts by soonest deadline first', () => {
    const list = [
      { nextDeadlineAt: at('18:00:00'), pendingCount: 1 },
      { nextDeadlineAt: at('09:00:00'), pendingCount: 1 },
      { nextDeadlineAt: at('14:00:00'), pendingCount: 1 },
    ];
    const sorted = [...list].sort(midweekComparator);
    expect(sorted.map(s => s.nextDeadlineAt.getUTCHours())).toEqual([9, 14, 18]);
  });

  it('breaks a same-deadline tie by higher pending count first', () => {
    const deadline = at('14:00:00');
    const list = [
      { nextDeadlineAt: deadline, pendingCount: 2 },
      { nextDeadlineAt: deadline, pendingCount: 9 },
      { nextDeadlineAt: deadline, pendingCount: 5 },
    ];
    const sorted = [...list].sort(midweekComparator);
    expect(sorted.map(s => s.pendingCount)).toEqual([9, 5, 2]);
  });

  it('sorts null deadlines after any real deadline', () => {
    const list = [
      { nextDeadlineAt: null, pendingCount: 10 },
      { nextDeadlineAt: at('09:00:00'), pendingCount: 1 },
    ];
    const sorted = [...list].sort(midweekComparator);
    expect(sorted[0].nextDeadlineAt).not.toBeNull();
    expect(sorted[1].nextDeadlineAt).toBeNull();
  });

  it('when both deadlines are null, breaks the tie by higher pending count first', () => {
    const list = [
      { nextDeadlineAt: null, pendingCount: 3 },
      { nextDeadlineAt: null, pendingCount: 8 },
    ];
    const sorted = [...list].sort(midweekComparator);
    expect(sorted.map(s => s.pendingCount)).toEqual([8, 3]);
  });
});
