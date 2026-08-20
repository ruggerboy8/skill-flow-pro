// Utility functions for Recommender Panel

// Formatting and display utilities
export function formatPrimaryReason(move: {
  primaryReasonCode: 'LOW_CONF' | 'RETEST' | 'NEVER' | 'STALE' | 'TIE';
  primaryReasonValue: number | null;
  lowConfShare: number | null;
  lastPracticedWeeks: number;
}): string {
  // lastPracticedWeeks can arrive as the string "999" when it crosses the
  // JSON boundary from the sequencer-rank edge function, even though the
  // type says number. Normalize once so the sentinel compare below is
  // reliable regardless of which shape it actually arrives in.
  const rawWeeks: unknown = move.lastPracticedWeeks;
  const weeks = typeof rawWeeks === 'string' ? Number(rawWeeks) : rawWeeks as number;

  switch (move.primaryReasonCode) {
    case 'LOW_CONF': {
      const pct = move.lowConfShare != null ? Math.round(move.lowConfShare * 100) : null;
      return pct != null ? `${pct}% of staff rated it 1–2 last check-in` : 'Low confidence signal';
    }
    case 'RETEST':
      return 'Scheduled for retest to verify improvement';
    case 'NEVER':
      return 'Never practiced yet';
    case 'STALE': {
      // A STALE reason code paired with the 999 "never practiced" sentinel is
      // contradictory upstream data (never-practiced moves should carry a
      // NEVER reason code, not STALE) and the type system does not prevent
      // it. Rather than silently falling back to a vague message, surface it
      // loudly so the bad data gets noticed and traced back to its source.
      if (weeks === 999) {
        console.warn(
          'formatPrimaryReason: STALE reason code with lastPracticedWeeks=999 (the "never practiced" sentinel) — conflicting upstream data.',
          move
        );
        return 'Conflicting data: marked stale but never practiced';
      }
      return `Not practiced in ${weeks} weeks`;
    }
    case 'TIE':
    default:
      return 'High overall need this week';
  }
}

export function formatLastPracticed(weeks: number): string {
  if (weeks === 999) return 'Never';
  if (weeks === 0) return 'This week';
  if (weeks === 1) return '1 wk ago';
  return `${weeks} wks ago`;
}

// Badge generation logic
export interface BadgeInfo {
  label: string;
  tooltip: string;
}

// At most 2 badges are ever shown (screen real estate on the recommender
// card/row). When more than 2 signal conditions fire on the same move, this
// order decides which ones survive the cap:
//
//   New (never practiced) > Low Conf > Retest > Stale
//
// "New" is deliberately ranked first. A move that has never been practiced
// is the single highest-signal fact a coach can see about it, so it must
// never be the one silently dropped by the cap, even on the rare move where
// Low Conf and Retest also fire (e.g. a never-practiced move that already
// has a retest scheduled and a low-confidence rating on record). See COR-5.
const BADGE_PRIORITY: readonly string[] = ['New', 'Low Conf', 'Retest', 'Stale'];

export function getBadges(move: {
  lowConfShare: number | null;
  retestDue: boolean;
  lastPracticedWeeks: number;
  primaryReasonCode: string;
}): BadgeInfo[] {
  // See the matching normalization note in formatPrimaryReason: this must
  // stay a number for both the 999 sentinel compare and the >= 8 staleness
  // compare, or a stringified "999" gets mislabeled as Stale instead of New.
  const rawWeeks: unknown = move.lastPracticedWeeks;
  const weeks = typeof rawWeeks === 'string' ? Number(rawWeeks) : rawWeeks as number;

  const candidates: Record<string, BadgeInfo> = {};

  if (move.primaryReasonCode === 'LOW_CONF' || (move.lowConfShare !== null && move.lowConfShare >= 0.33)) {
    candidates['Low Conf'] = {
      label: 'Low Conf',
      tooltip: 'High share of 1–2 scores recently',
    };
  }

  if (move.retestDue) {
    candidates['Retest'] = {
      label: 'Retest',
      tooltip: 'Return soon to verify improvement',
    };
  }

  if (weeks === 999) {
    candidates['New'] = {
      label: 'New',
      tooltip: 'Never practiced yet',
    };
  }

  // Stale (8+ weeks, not retest, not never)
  if (!move.retestDue && weeks !== 999 && weeks >= 8) {
    candidates['Stale'] = {
      label: 'Stale',
      tooltip: 'Not practiced in 8+ weeks',
    };
  }

  return BADGE_PRIORITY.filter((label) => candidates[label])
    .map((label) => candidates[label])
    .slice(0, 2);
}

// Filtering and sorting functions
export interface FilterState {
  signals: ('low_conf' | 'never' | 'stale' | 'retest')[];
  domains: string[];
}

const REASON_PRIORITY: Record<string, number> = {
  'LOW_CONF': 4,
  'RETEST': 3,
  'NEVER': 2,
  'STALE': 1,
  'TIE': 0,
};

export function applyFilters(
  moves: any[],
  filters: FilterState,
  sort: 'need' | 'lowConf' | 'weeks' | 'domain'
): any[] {
  let result = [...moves];

  // Apply signal filters (union - include if ANY match)
  if (filters.signals.length > 0) {
    result = result.filter((move) => {
      return filters.signals.some((signal) => {
        switch (signal) {
          case 'low_conf':
            return move.lowConfShare !== null && move.lowConfShare >= 0.33;
          case 'never':
            return move.lastPracticedWeeks === 999;
          case 'stale':
            return move.lastPracticedWeeks >= 8 && move.lastPracticedWeeks !== 999;
          case 'retest':
            return move.retestDue === true;
          default:
            return false;
        }
      });
    });
  }

  // Apply domain filters (union - include if ANY match)
  if (filters.domains.length > 0) {
    result = result.filter((move) => filters.domains.includes(move.domainName));
  }

  // Apply sorting
  result.sort((a, b) => {
    switch (sort) {
      case 'need': {
        // 1. finalScore desc
        if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
        // 2. primaryReasonCode priority
        const aPri = REASON_PRIORITY[a.primaryReasonCode] || 0;
        const bPri = REASON_PRIORITY[b.primaryReasonCode] || 0;
        if (bPri !== aPri) return bPri - aPri;
        // 3. lowConfShare desc (nulls last)
        if (a.lowConfShare === null && b.lowConfShare !== null) return 1;
        if (a.lowConfShare !== null && b.lowConfShare === null) return -1;
        if (a.lowConfShare !== null && b.lowConfShare !== null && b.lowConfShare !== a.lowConfShare) {
          return b.lowConfShare - a.lowConfShare;
        }
        // 4. lastPracticedWeeks desc (999 sorts highest)
        if (b.lastPracticedWeeks !== a.lastPracticedWeeks) {
          return b.lastPracticedWeeks - a.lastPracticedWeeks;
        }
        // 5. proMoveId asc
        return a.proMoveId - b.proMoveId;
      }
      case 'lowConf': {
        // 1. lowConfShare desc (nulls last)
        if (a.lowConfShare === null && b.lowConfShare !== null) return 1;
        if (a.lowConfShare !== null && b.lowConfShare === null) return -1;
        if (a.lowConfShare !== null && b.lowConfShare !== null && b.lowConfShare !== a.lowConfShare) {
          return b.lowConfShare - a.lowConfShare;
        }
        // 2. finalScore desc
        return b.finalScore - a.finalScore;
      }
      case 'weeks': {
        // 1. lastPracticedWeeks desc (999 sorts highest)
        if (b.lastPracticedWeeks !== a.lastPracticedWeeks) {
          return b.lastPracticedWeeks - a.lastPracticedWeeks;
        }
        // 2. finalScore desc
        return b.finalScore - a.finalScore;
      }
      case 'domain': {
        // 1. domainName asc
        if (a.domainName < b.domainName) return -1;
        if (a.domainName > b.domainName) return 1;
        // 2. finalScore desc
        return b.finalScore - a.finalScore;
      }
      default:
        return 0;
    }
  });

  return result;
}

export function getDomainColorHsl(domainName: string): string {
  const colors: Record<string, string> = {
    'Clinical': '214, 78%, 52%',
    'Clerical': '155, 70%, 45%',
    'Cultural': '280, 65%, 60%',
    'Case Acceptance': '25, 85%, 55%',
  };
  return colors[domainName] || '0, 0%, 50%';
}
