// Utility functions for Recommender Panel

// Formatting and display utilities
export function formatPrimaryReason(move: {
  primaryReasonCode: 'LOW_CONF' | 'RETEST' | 'NEVER' | 'STALE' | 'TIE';
  primaryReasonValue: number | null;
  lowConfShare: number | null;
  lastPracticedWeeks: number;
}): string {
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
      const w = move.lastPracticedWeeks === 999 ? null : move.lastPracticedWeeks;
      return w != null ? `Not practiced in ${w} weeks` : 'Not practiced recently';
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

export function getBadges(move: {
  lowConfShare: number | null;
  retestDue: boolean;
  lastPracticedWeeks: number;
  primaryReasonCode: string;
}): BadgeInfo[] {
  const badges: BadgeInfo[] = [];
  
  // Priority 1: Low confidence (>=33% rated 1-2)
  if (move.primaryReasonCode === 'LOW_CONF' || (move.lowConfShare !== null && move.lowConfShare >= 0.33)) {
    badges.push({
      label: 'Low Conf',
      tooltip: 'High share of 1–2 scores recently',
    });
  }
  
  // Priority 2: Retest due
  if (move.retestDue) {
    badges.push({
      label: 'Retest',
      tooltip: 'Return soon to verify improvement',
    });
  }
  
  // Priority 3: Never practiced
  if (move.lastPracticedWeeks === 999) {
    badges.push({
      label: 'New',
      tooltip: 'Never practiced yet',
    });
  }
  
  // Priority 4: Stale (8+ weeks, not retest, not never)
  if (!move.retestDue && move.lastPracticedWeeks !== 999 && move.lastPracticedWeeks >= 8) {
    badges.push({
      label: 'Stale',
      tooltip: 'Not practiced in 8+ weeks',
    });
  }
  
  // Return max 2 badges
  return badges.slice(0, 2);
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
