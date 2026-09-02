import { describe, it, expect, vi } from 'vitest';
import { applyFilters, getBadges, formatPrimaryReason, formatLastPracticed, FilterState } from './recommenderUtils';

// A "move" here is a ranked Pro Move recommendation as the sequencer panel
// renders it: a candidate for "what should this location practice this
// week," carrying the signals a coach uses to judge urgency (confidence
// scores, weeks since last practiced, whether a retest is due).

type Move = {
  proMoveId: number;
  domainName: string;
  finalScore: number;
  primaryReasonCode: string;
  lowConfShare: number | null;
  lastPracticedWeeks: number;
  retestDue: boolean;
};

function move(overrides: Partial<Move> = {}): Move {
  return {
    proMoveId: 1,
    domainName: 'Clinical',
    finalScore: 50,
    primaryReasonCode: 'TIE',
    lowConfShare: null,
    lastPracticedWeeks: 0,
    retestDue: false,
    ...overrides,
  };
}

const NO_FILTERS: FilterState = { signals: [], domains: [] };

describe('formatPrimaryReason', () => {
  it('shows the low-confidence share as a percentage when one is present', () => {
    const text = formatPrimaryReason({
      primaryReasonCode: 'LOW_CONF',
      primaryReasonValue: null,
      lowConfShare: 0.4,
      lastPracticedWeeks: 0,
    });
    expect(text).toBe('40% of staff rated it 1–2 last check-in');
  });

  it('falls back to a generic low-confidence message when no share is known', () => {
    const text = formatPrimaryReason({
      primaryReasonCode: 'LOW_CONF',
      primaryReasonValue: null,
      lowConfShare: null,
      lastPracticedWeeks: 0,
    });
    expect(text).toBe('Low confidence signal');
  });

  it('explains a retest reason without needing a numeric value', () => {
    const text = formatPrimaryReason({
      primaryReasonCode: 'RETEST',
      primaryReasonValue: null,
      lowConfShare: null,
      lastPracticedWeeks: 0,
    });
    expect(text).toBe('Scheduled for retest to verify improvement');
  });

  it('explains a never-practiced reason', () => {
    const text = formatPrimaryReason({
      primaryReasonCode: 'NEVER',
      primaryReasonValue: null,
      lowConfShare: null,
      lastPracticedWeeks: 999,
    });
    expect(text).toBe('Never practiced yet');
  });

  it('states the number of weeks for a staleness reason', () => {
    const text = formatPrimaryReason({
      primaryReasonCode: 'STALE',
      primaryReasonValue: null,
      lowConfShare: null,
      lastPracticedWeeks: 10,
    });
    expect(text).toBe('Not practiced in 10 weeks');
  });

  it('surfaces a conflicting-data message and warns when a STALE reason is paired with the "never" sentinel (999)', () => {
    // A STALE reason paired with the 999 "never practiced" sentinel is a
    // contradiction the type system does not prevent. Rather than quietly
    // falling back to a vague message, this should be loud: an explicit
    // "conflicting data" message plus a console.warn so the bad upstream
    // data gets noticed. See COR-5.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const text = formatPrimaryReason({
      primaryReasonCode: 'STALE',
      primaryReasonValue: null,
      lowConfShare: null,
      lastPracticedWeeks: 999,
    });
    expect(text).toBe('Conflicting data: marked stale but never practiced');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('still detects the conflict when lastPracticedWeeks arrives as the string "999" (a JSON-boundary shape the type does not admit)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const text = formatPrimaryReason({
      primaryReasonCode: 'STALE',
      primaryReasonValue: null,
      lowConfShare: null,
      lastPracticedWeeks: '999' as unknown as number,
    });
    expect(text).toBe('Conflicting data: marked stale but never practiced');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('explains a tie reason as high overall need', () => {
    const text = formatPrimaryReason({
      primaryReasonCode: 'TIE',
      primaryReasonValue: null,
      lowConfShare: null,
      lastPracticedWeeks: 0,
    });
    expect(text).toBe('High overall need this week');
  });

  it('falls back to the tie message for an unrecognized reason code', () => {
    const text = formatPrimaryReason({
      // @ts-expect-error - deliberately passing a code outside the known union
      primaryReasonCode: 'SOMETHING_NEW',
      primaryReasonValue: null,
      lowConfShare: null,
      lastPracticedWeeks: 0,
    });
    expect(text).toBe('High overall need this week');
  });
});

describe('getBadges', () => {
  it('shows no badges when none of the signal conditions are met', () => {
    const badges = getBadges({
      lowConfShare: 0.1,
      retestDue: false,
      lastPracticedWeeks: 3,
      primaryReasonCode: 'TIE',
    });
    expect(badges).toEqual([]);
  });

  describe('Low Confidence badge (>= 33% of staff rated it 1-2)', () => {
    it('shows at exactly the 33% boundary', () => {
      const badges = getBadges({
        lowConfShare: 0.33,
        retestDue: false,
        lastPracticedWeeks: 0,
        primaryReasonCode: 'TIE',
      });
      expect(badges.map((b) => b.label)).toContain('Low Conf');
    });

    it('does not show just below the 33% boundary', () => {
      const badges = getBadges({
        lowConfShare: 0.329,
        retestDue: false,
        lastPracticedWeeks: 0,
        primaryReasonCode: 'TIE',
      });
      expect(badges.map((b) => b.label)).not.toContain('Low Conf');
    });

    it('shows when the primary reason is LOW_CONF even if the share itself is unknown', () => {
      const badges = getBadges({
        lowConfShare: null,
        retestDue: false,
        lastPracticedWeeks: 0,
        primaryReasonCode: 'LOW_CONF',
      });
      expect(badges.map((b) => b.label)).toContain('Low Conf');
    });
  });

  describe('Retest badge', () => {
    it('shows when a retest is due', () => {
      const badges = getBadges({
        lowConfShare: null,
        retestDue: true,
        lastPracticedWeeks: 0,
        primaryReasonCode: 'RETEST',
      });
      expect(badges.map((b) => b.label)).toContain('Retest');
    });

    it('does not show when no retest is due', () => {
      const badges = getBadges({
        lowConfShare: null,
        retestDue: false,
        lastPracticedWeeks: 0,
        primaryReasonCode: 'TIE',
      });
      expect(badges.map((b) => b.label)).not.toContain('Retest');
    });
  });

  describe('New badge (never practiced, weeks sentinel = 999)', () => {
    it('shows at exactly the 999 "never practiced" sentinel', () => {
      const badges = getBadges({
        lowConfShare: null,
        retestDue: false,
        lastPracticedWeeks: 999,
        primaryReasonCode: 'NEVER',
      });
      expect(badges.map((b) => b.label)).toContain('New');
    });

    it('does not show one week below the sentinel', () => {
      const badges = getBadges({
        lowConfShare: null,
        retestDue: false,
        lastPracticedWeeks: 998,
        primaryReasonCode: 'STALE',
      });
      expect(badges.map((b) => b.label)).not.toContain('New');
    });

    it('still labels the move New, not Stale, when lastPracticedWeeks arrives as the string "999" (a JSON-boundary shape the type does not admit)', () => {
      const badges = getBadges({
        lowConfShare: null,
        retestDue: false,
        lastPracticedWeeks: '999' as unknown as number,
        primaryReasonCode: 'NEVER',
      });
      expect(badges.map((b) => b.label)).toContain('New');
      expect(badges.map((b) => b.label)).not.toContain('Stale');
    });
  });

  describe('Stale badge (>= 8 weeks, not retest, not never)', () => {
    it('shows at exactly the 8-week boundary', () => {
      const badges = getBadges({
        lowConfShare: null,
        retestDue: false,
        lastPracticedWeeks: 8,
        primaryReasonCode: 'STALE',
      });
      expect(badges.map((b) => b.label)).toContain('Stale');
    });

    it('does not show one week below the boundary', () => {
      const badges = getBadges({
        lowConfShare: null,
        retestDue: false,
        lastPracticedWeeks: 7,
        primaryReasonCode: 'TIE',
      });
      expect(badges.map((b) => b.label)).not.toContain('Stale');
    });

    it('is suppressed by a due retest even past the staleness threshold', () => {
      const badges = getBadges({
        lowConfShare: null,
        retestDue: true,
        lastPracticedWeeks: 20,
        primaryReasonCode: 'RETEST',
      });
      expect(badges.map((b) => b.label)).not.toContain('Stale');
    });

    it('is suppressed by the never-practiced sentinel even though 999 >= 8', () => {
      const badges = getBadges({
        lowConfShare: null,
        retestDue: false,
        lastPracticedWeeks: 999,
        primaryReasonCode: 'NEVER',
      });
      expect(badges.map((b) => b.label)).not.toContain('Stale');
    });
  });

  it('caps display at two badges, keeping the two highest-priority ones', () => {
    // Low Conf, Retest and New can all technically fire together even
    // though this combination is a strange real-world state (never
    // practiced but a retest is due). "New" is the highest-signal fact here
    // (see BADGE_PRIORITY in recommenderUtils.ts), so it must survive the
    // 2-badge cap instead of being silently dropped. See COR-5.
    const badges = getBadges({
      lowConfShare: 0.5,
      retestDue: true,
      lastPracticedWeeks: 999,
      primaryReasonCode: 'LOW_CONF',
    });
    expect(badges).toHaveLength(2);
    expect(badges.map((b) => b.label)).toEqual(['New', 'Low Conf']);
  });

  it('keeps "New" even when all four signal conditions fire at once', () => {
    const badges = getBadges({
      lowConfShare: 0.5,
      retestDue: true,
      lastPracticedWeeks: 999,
      primaryReasonCode: 'LOW_CONF',
    });
    expect(badges.map((b) => b.label)).toContain('New');
  });

  it('orders badges by priority (New > Low Conf > Retest > Stale) regardless of which two survive the cap', () => {
    // Low Conf + Retest, no New in play: order should still follow priority.
    const badges = getBadges({
      lowConfShare: 0.5,
      retestDue: true,
      lastPracticedWeeks: 3,
      primaryReasonCode: 'LOW_CONF',
    });
    expect(badges.map((b) => b.label)).toEqual(['Low Conf', 'Retest']);
  });

  it('orders New before Low Conf when only those two fire (nothing is dropped by the cap)', () => {
    // Before COR-5's priority reordering this pushed in insertion order
    // (Low Conf, New); the new deliberate order puts New first. Pinning it
    // here even though both badges display either way, since the order is
    // now an intentional choice, not an accident of insertion.
    const badges = getBadges({
      lowConfShare: 0.5,
      retestDue: false,
      lastPracticedWeeks: 999,
      primaryReasonCode: 'LOW_CONF',
    });
    expect(badges.map((b) => b.label)).toEqual(['New', 'Low Conf']);
  });

  it('orders New before Retest when only those two fire (nothing is dropped by the cap)', () => {
    // Same as above: was insertion order (Retest, New), now deliberately New
    // first.
    const badges = getBadges({
      lowConfShare: null,
      retestDue: true,
      lastPracticedWeeks: 999,
      primaryReasonCode: 'RETEST',
    });
    expect(badges.map((b) => b.label)).toEqual(['New', 'Retest']);
  });
});

describe('applyFilters - signal filters', () => {
  it('returns every move when no signal filters are selected', () => {
    const moves = [move({ proMoveId: 1 }), move({ proMoveId: 2 })];
    const result = applyFilters(moves, NO_FILTERS, 'need');
    expect(result.map((m) => m.proMoveId).sort()).toEqual([1, 2]);
  });

  it('keeps only moves at or above the low-confidence boundary when filtering by low_conf', () => {
    const atBoundary = move({ proMoveId: 1, lowConfShare: 0.33 });
    const belowBoundary = move({ proMoveId: 2, lowConfShare: 0.329 });
    const unknown = move({ proMoveId: 3, lowConfShare: null });

    const result = applyFilters(
      [atBoundary, belowBoundary, unknown],
      { signals: ['low_conf'], domains: [] },
      'need'
    );
    expect(result.map((m) => m.proMoveId)).toEqual([1]);
  });

  it('keeps only never-practiced moves (999 sentinel) when filtering by never', () => {
    const never = move({ proMoveId: 1, lastPracticedWeeks: 999 });
    const almostNever = move({ proMoveId: 2, lastPracticedWeeks: 998 });

    const result = applyFilters(
      [never, almostNever],
      { signals: ['never'], domains: [] },
      'need'
    );
    expect(result.map((m) => m.proMoveId)).toEqual([1]);
  });

  it('keeps moves at or above the 8-week staleness boundary, excluding the never sentinel, when filtering by stale', () => {
    const atBoundary = move({ proMoveId: 1, lastPracticedWeeks: 8 });
    const belowBoundary = move({ proMoveId: 2, lastPracticedWeeks: 7 });
    const never = move({ proMoveId: 3, lastPracticedWeeks: 999 });

    const result = applyFilters(
      [atBoundary, belowBoundary, never],
      { signals: ['stale'], domains: [] },
      'need'
    );
    expect(result.map((m) => m.proMoveId)).toEqual([1]);
  });

  it('keeps only moves with a due retest when filtering by retest', () => {
    const due = move({ proMoveId: 1, retestDue: true });
    const notDue = move({ proMoveId: 2, retestDue: false });

    const result = applyFilters(
      [due, notDue],
      { signals: ['retest'], domains: [] },
      'need'
    );
    expect(result.map((m) => m.proMoveId)).toEqual([1]);
  });

  it('unions multiple selected signals, keeping a move that matches any one of them', () => {
    const lowConfOnly = move({ proMoveId: 1, lowConfShare: 0.5 });
    const retestOnly = move({ proMoveId: 2, retestDue: true });
    const neither = move({ proMoveId: 3 });

    const result = applyFilters(
      [lowConfOnly, retestOnly, neither],
      { signals: ['low_conf', 'retest'], domains: [] },
      'need'
    );
    expect(result.map((m) => m.proMoveId).sort()).toEqual([1, 2]);
  });

  it('returns an empty list when no move matches the selected signals', () => {
    const moves = [move({ proMoveId: 1 }), move({ proMoveId: 2 })];
    const result = applyFilters(moves, { signals: ['retest'], domains: [] }, 'need');
    expect(result).toEqual([]);
  });
});

describe('applyFilters - domain filters', () => {
  it('returns every move when no domain filters are selected', () => {
    const moves = [move({ proMoveId: 1, domainName: 'Clinical' }), move({ proMoveId: 2, domainName: 'Clerical' })];
    const result = applyFilters(moves, NO_FILTERS, 'need');
    expect(result).toHaveLength(2);
  });

  it('keeps only moves whose domain is among the selected domains', () => {
    const clinical = move({ proMoveId: 1, domainName: 'Clinical' });
    const clerical = move({ proMoveId: 2, domainName: 'Clerical' });
    const cultural = move({ proMoveId: 3, domainName: 'Cultural' });

    const result = applyFilters(
      [clinical, clerical, cultural],
      { signals: [], domains: ['Clinical', 'Cultural'] },
      'need'
    );
    expect(result.map((m) => m.proMoveId).sort()).toEqual([1, 3]);
  });

  it('combines a signal filter and a domain filter as AND (both must pass)', () => {
    const matchesBoth = move({ proMoveId: 1, domainName: 'Clinical', retestDue: true });
    const matchesDomainOnly = move({ proMoveId: 2, domainName: 'Clinical', retestDue: false });
    const matchesSignalOnly = move({ proMoveId: 3, domainName: 'Clerical', retestDue: true });

    const result = applyFilters(
      [matchesBoth, matchesDomainOnly, matchesSignalOnly],
      { signals: ['retest'], domains: ['Clinical'] },
      'need'
    );
    expect(result.map((m) => m.proMoveId)).toEqual([1]);
  });

  it('returns an empty list when the signal and domain filters have no overlap', () => {
    const moves = [
      move({ proMoveId: 1, domainName: 'Clinical', retestDue: false }),
      move({ proMoveId: 2, domainName: 'Clerical', retestDue: true }),
    ];
    const result = applyFilters(
      moves,
      { signals: ['retest'], domains: ['Clinical'] },
      'need'
    );
    expect(result).toEqual([]);
  });
});

describe('applyFilters - "need" sort (the default recommender ordering)', () => {
  it('ranks a higher overall need score first', () => {
    const high = move({ proMoveId: 1, finalScore: 90 });
    const low = move({ proMoveId: 2, finalScore: 10 });
    const result = applyFilters([low, high], NO_FILTERS, 'need');
    expect(result.map((m) => m.proMoveId)).toEqual([1, 2]);
  });

  it('breaks a tie in overall need score by reason-code priority (Low Confidence outranks a tie reason)', () => {
    const lowConf = move({ proMoveId: 1, finalScore: 50, primaryReasonCode: 'LOW_CONF' });
    const tie = move({ proMoveId: 2, finalScore: 50, primaryReasonCode: 'TIE' });
    const result = applyFilters([tie, lowConf], NO_FILTERS, 'need');
    expect(result.map((m) => m.proMoveId)).toEqual([1, 2]);
  });

  it('orders reason-code priority as Low Confidence > Retest > Never > Stale > Tie', () => {
    const stale = move({ proMoveId: 1, finalScore: 50, primaryReasonCode: 'STALE' });
    const never = move({ proMoveId: 2, finalScore: 50, primaryReasonCode: 'NEVER' });
    const retest = move({ proMoveId: 3, finalScore: 50, primaryReasonCode: 'RETEST' });
    const lowConf = move({ proMoveId: 4, finalScore: 50, primaryReasonCode: 'LOW_CONF' });
    const tie = move({ proMoveId: 5, finalScore: 50, primaryReasonCode: 'TIE' });

    const result = applyFilters([stale, never, retest, lowConf, tie], NO_FILTERS, 'need');
    expect(result.map((m) => m.proMoveId)).toEqual([4, 3, 2, 1, 5]);
  });

  it('breaks a reason-code tie by higher low-confidence share, sorting a known share above an unknown one', () => {
    const withShare = move({ proMoveId: 1, finalScore: 50, primaryReasonCode: 'TIE', lowConfShare: 0.1 });
    const noShare = move({ proMoveId: 2, finalScore: 50, primaryReasonCode: 'TIE', lowConfShare: null });
    const result = applyFilters([noShare, withShare], NO_FILTERS, 'need');
    expect(result.map((m) => m.proMoveId)).toEqual([1, 2]);
  });

  it('breaks a low-confidence-share tie by weeks since last practiced, with the never-practiced sentinel (999) sorting highest', () => {
    const neverPracticed = move({
      proMoveId: 1,
      finalScore: 50,
      primaryReasonCode: 'TIE',
      lowConfShare: 0.1,
      lastPracticedWeeks: 999,
    });
    const practicedRecently = move({
      proMoveId: 2,
      finalScore: 50,
      primaryReasonCode: 'TIE',
      lowConfShare: 0.1,
      lastPracticedWeeks: 2,
    });
    const result = applyFilters([practicedRecently, neverPracticed], NO_FILTERS, 'need');
    expect(result.map((m) => m.proMoveId)).toEqual([1, 2]);
  });

  it('breaks a complete tie by ascending Pro Move id, as a final deterministic tiebreaker', () => {
    const a = move({ proMoveId: 5, finalScore: 50, primaryReasonCode: 'TIE', lowConfShare: 0.1, lastPracticedWeeks: 2 });
    const b = move({ proMoveId: 2, finalScore: 50, primaryReasonCode: 'TIE', lowConfShare: 0.1, lastPracticedWeeks: 2 });
    const c = move({ proMoveId: 9, finalScore: 50, primaryReasonCode: 'TIE', lowConfShare: 0.1, lastPracticedWeeks: 2 });
    const result = applyFilters([a, b, c], NO_FILTERS, 'need');
    expect(result.map((m) => m.proMoveId)).toEqual([2, 5, 9]);
  });

  it('does not mutate the input array', () => {
    const a = move({ proMoveId: 1, finalScore: 10 });
    const b = move({ proMoveId: 2, finalScore: 90 });
    const input = [a, b];
    applyFilters(input, NO_FILTERS, 'need');
    expect(input).toEqual([a, b]);
  });
});

describe('applyFilters - "lowConf" sort', () => {
  it('ranks a higher low-confidence share first, with unknown shares sorted last', () => {
    const high = move({ proMoveId: 1, lowConfShare: 0.8 });
    const low = move({ proMoveId: 2, lowConfShare: 0.2 });
    const unknown = move({ proMoveId: 3, lowConfShare: null });
    const result = applyFilters([unknown, low, high], NO_FILTERS, 'lowConf');
    expect(result.map((m) => m.proMoveId)).toEqual([1, 2, 3]);
  });

  it('breaks a low-confidence-share tie by higher overall need score', () => {
    const higherNeed = move({ proMoveId: 1, lowConfShare: 0.5, finalScore: 90 });
    const lowerNeed = move({ proMoveId: 2, lowConfShare: 0.5, finalScore: 10 });
    const result = applyFilters([lowerNeed, higherNeed], NO_FILTERS, 'lowConf');
    expect(result.map((m) => m.proMoveId)).toEqual([1, 2]);
  });
});

describe('applyFilters - "weeks" sort', () => {
  it('ranks the longest time since last practiced first, with the never-practiced sentinel (999) sorting highest', () => {
    const neverPracticed = move({ proMoveId: 1, lastPracticedWeeks: 999 });
    const staleFewWeeks = move({ proMoveId: 2, lastPracticedWeeks: 10 });
    const practicedRecently = move({ proMoveId: 3, lastPracticedWeeks: 1 });
    const result = applyFilters([practicedRecently, staleFewWeeks, neverPracticed], NO_FILTERS, 'weeks');
    expect(result.map((m) => m.proMoveId)).toEqual([1, 2, 3]);
  });

  it('breaks a weeks-since-practiced tie by higher overall need score', () => {
    const higherNeed = move({ proMoveId: 1, lastPracticedWeeks: 5, finalScore: 90 });
    const lowerNeed = move({ proMoveId: 2, lastPracticedWeeks: 5, finalScore: 10 });
    const result = applyFilters([lowerNeed, higherNeed], NO_FILTERS, 'weeks');
    expect(result.map((m) => m.proMoveId)).toEqual([1, 2]);
  });
});

describe('applyFilters - "domain" sort', () => {
  it('orders alphabetically by domain name', () => {
    const cultural = move({ proMoveId: 1, domainName: 'Cultural' });
    const clerical = move({ proMoveId: 2, domainName: 'Clerical' });
    const clinical = move({ proMoveId: 3, domainName: 'Clinical' });
    const result = applyFilters([cultural, clerical, clinical], NO_FILTERS, 'domain');
    expect(result.map((m) => m.proMoveId)).toEqual([2, 3, 1]);
  });

  it('breaks a domain-name tie by higher overall need score', () => {
    const higherNeed = move({ proMoveId: 1, domainName: 'Clinical', finalScore: 90 });
    const lowerNeed = move({ proMoveId: 2, domainName: 'Clinical', finalScore: 10 });
    const result = applyFilters([lowerNeed, higherNeed], NO_FILTERS, 'domain');
    expect(result.map((m) => m.proMoveId)).toEqual([1, 2]);
  });
});

describe('lastPracticedWeeks sentinel normalization (string "999" vs numeric 999)', () => {
  // lastPracticedWeeks can cross the JSON boundary from the sequencer-rank
  // edge function as the string "999" instead of the number 999, even though
  // every type in recommenderUtils.ts says number. Every function that reads
  // it funnels through one normalizeWeeks() helper, so the string sentinel
  // must behave identically to the numeric one everywhere: the badge, the
  // conflict-message path, the "never" filter, the "stale" filter, and
  // formatLastPracticed. See COR-5.
  const stringSentinel = '999' as unknown as number;

  it('labels the move New (not Stale) in getBadges', () => {
    const badges = getBadges({
      lowConfShare: null,
      retestDue: false,
      lastPracticedWeeks: stringSentinel,
      primaryReasonCode: 'NEVER',
    });
    expect(badges.map((b) => b.label)).toContain('New');
    expect(badges.map((b) => b.label)).not.toContain('Stale');
  });

  it('surfaces the conflicting-data message when paired with a STALE reason code', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const text = formatPrimaryReason({
      primaryReasonCode: 'STALE',
      primaryReasonValue: null,
      lowConfShare: null,
      lastPracticedWeeks: stringSentinel,
    });
    expect(text).toBe('Conflicting data: marked stale but never practiced');
    warnSpy.mockRestore();
  });

  it('is included by the "never" signal filter', () => {
    const neverAsString = move({ proMoveId: 1, lastPracticedWeeks: stringSentinel });
    const result = applyFilters([neverAsString], { signals: ['never'], domains: [] }, 'need');
    expect(result.map((m) => m.proMoveId)).toEqual([1]);
  });

  it('is excluded by the "stale" signal filter even though 999 >= 8', () => {
    const neverAsString = move({ proMoveId: 1, lastPracticedWeeks: stringSentinel });
    const result = applyFilters([neverAsString], { signals: ['stale'], domains: [] }, 'need');
    expect(result).toEqual([]);
  });

  it('formats as "Never" in formatLastPracticed', () => {
    expect(formatLastPracticed(stringSentinel)).toBe('Never');
  });
});
