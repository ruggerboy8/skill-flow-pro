import { describe, expect, it } from 'vitest';
import { buildLocationStatusLine, type LocationStatusLineInput } from './locationStatusLine';

const base: LocationStatusLineInput = {
  tier: 'good',
  isFullyExcused: false,
  isPartiallyExcused: false,
  confExcused: false,
  perfExcused: false,
  confReason: null,
  perfReason: null,
  confClosed: false,
  perfClosed: false,
  perfOpen: false,
  missingConfCount: 0,
  missingPerfCount: 0,
  distinctMissedCount: 0,
  nextDeadlineLabel: null,
};

describe('buildLocationStatusLine', () => {
  describe('pre-deadline (nothing due yet)', () => {
    it('shows the next deadline as a lowercased prose phrase', () => {
      expect(
        buildLocationStatusLine({ ...base, nextDeadlineLabel: 'Conf due Tue 10:00 AM' }),
      ).toEqual([{ text: 'conf due Tue 10:00 AM' }]);
    });

    it('returns no phrases when there is no next-deadline label', () => {
      expect(buildLocationStatusLine({ ...base, nextDeadlineLabel: null })).toEqual([]);
    });
  });

  describe('conf closed, perf open, good', () => {
    const state: LocationStatusLineInput = {
      ...base,
      tier: 'good',
      confClosed: true,
      perfOpen: true,
      nextDeadlineLabel: 'Perf due Fri 5:00 PM',
    };

    it('rewords the perf-due label as a window-open phrase when there is no lateness', () => {
      expect(buildLocationStatusLine(state)).toEqual([
        { text: 'perf window open until Fri 5:00 PM' },
      ]);
    });

    it('leads with the late-conf fact when there are stragglers', () => {
      expect(buildLocationStatusLine({ ...state, missingConfCount: 1 })).toEqual([
        { text: '1 late (conf)' },
        { text: 'perf window open until Fri 5:00 PM' },
      ]);
    });
  });

  describe('conf closed, perf open, watch', () => {
    it('reads as a quiet late-count fact, not an alarm phrase', () => {
      expect(
        buildLocationStatusLine({
          ...base,
          tier: 'watch',
          confClosed: true,
          perfOpen: true,
          missingConfCount: 3,
          nextDeadlineLabel: 'Perf due Fri 5:00 PM',
        }),
      ).toEqual([{ text: '3 late (conf)' }, { text: 'perf window open until Fri 5:00 PM' }]);
    });
  });

  describe('conf closed, perf open, red', () => {
    it('collapses to a single people-missing sentence using the distinct count', () => {
      expect(
        buildLocationStatusLine({
          ...base,
          tier: 'red',
          confClosed: true,
          perfOpen: true,
          missingConfCount: 7,
          distinctMissedCount: 7,
          nextDeadlineLabel: 'Perf due Fri 5:00 PM',
        }),
      ).toEqual([
        { text: '7 people missing (conf)' },
        { text: 'perf window open until Fri 5:00 PM' },
      ]);
    });
  });

  describe('both closed, good', () => {
    const state: LocationStatusLineInput = {
      ...base,
      tier: 'good',
      confClosed: true,
      perfClosed: true,
    };

    it('shows a quiet check-icon "all in" phrase when nothing is late', () => {
      expect(buildLocationStatusLine(state)).toEqual([{ text: 'all in', icon: 'check' }]);
    });

    it('shows a muted late fact for a single straggler', () => {
      expect(buildLocationStatusLine({ ...state, missingConfCount: 1 })).toEqual([
        { text: '1 late (conf)' },
      ]);
    });

    it('shows both metrics when both have stragglers', () => {
      expect(
        buildLocationStatusLine({ ...state, missingConfCount: 1, missingPerfCount: 2 }),
      ).toEqual([{ text: '1 late (conf)' }, { text: '2 late (perf)' }]);
    });
  });

  describe('both closed, watch', () => {
    it('uses the same late-breakdown phrasing as good, just under the watch tier', () => {
      expect(
        buildLocationStatusLine({
          ...base,
          tier: 'watch',
          confClosed: true,
          perfClosed: true,
          missingConfCount: 2,
          missingPerfCount: 1,
        }),
      ).toEqual([{ text: '2 late (conf)' }, { text: '1 late (perf)' }]);
    });
  });

  describe('both closed, red', () => {
    it('combines both metrics into one people-missing sentence', () => {
      expect(
        buildLocationStatusLine({
          ...base,
          tier: 'red',
          confClosed: true,
          perfClosed: true,
          missingConfCount: 6,
          missingPerfCount: 5,
          distinctMissedCount: 7,
        }),
      ).toEqual([{ text: '7 people missing: 6 conf, 5 perf' }]);
    });

    it('simplifies to one metric when only that metric has misses', () => {
      expect(
        buildLocationStatusLine({
          ...base,
          tier: 'red',
          confClosed: true,
          perfClosed: true,
          missingConfCount: 0,
          missingPerfCount: 4,
          distinctMissedCount: 4,
        }),
      ).toEqual([{ text: '4 people missing (perf)' }]);
    });
  });

  describe('fully excused', () => {
    it('always reads "no submissions required", regardless of tier or reason', () => {
      expect(
        buildLocationStatusLine({
          ...base,
          isFullyExcused: true,
          confExcused: true,
          perfExcused: true,
          confReason: 'holiday closure',
        }),
      ).toEqual([{ text: 'no submissions required' }]);
    });
  });

  describe('partially excused', () => {
    it('names the excused metric with its reason', () => {
      expect(
        buildLocationStatusLine({
          ...base,
          isPartiallyExcused: true,
          confExcused: true,
          confReason: 'new location ramp-up',
        }),
      ).toEqual([{ text: 'conf excused: new location ramp-up' }]);
    });

    it('names the excused metric without a reason', () => {
      expect(
        buildLocationStatusLine({
          ...base,
          isPartiallyExcused: true,
          perfExcused: true,
          perfReason: null,
        }),
      ).toEqual([{ text: 'perf excused' }]);
    });
  });

  describe('deadline label formatting edge cases', () => {
    it('lowercases an unrecognized label shape as a fallback', () => {
      expect(
        buildLocationStatusLine({ ...base, nextDeadlineLabel: 'Something else due soon' }),
      ).toEqual([{ text: 'something else due soon' }]);
    });
  });
});
