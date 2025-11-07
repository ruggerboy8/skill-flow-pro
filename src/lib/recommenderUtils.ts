// Utility functions for Recommender Panel

export function formatPrimaryReason(
  code: 'LOW_CONF' | 'RETEST' | 'NEVER' | 'STALE' | 'TIE',
  value: number | null
): string {
  switch (code) {
    case 'LOW_CONF':
      return value !== null 
        ? `${Math.round(value * 100)}% of staff rated this 1–2 last time`
        : 'Low confidence detected';
    case 'RETEST':
      return 'Scheduled retest: verify improvement';
    case 'NEVER':
      return 'Never practiced yet';
    case 'STALE':
      return value !== null
        ? `Not practiced in ${value} weeks`
        : 'Not practiced recently';
    case 'TIE':
    default:
      return '';
  }
}

export function formatLastPracticed(weeks: number): string {
  if (weeks === 999) return 'Never';
  if (weeks === 0) return 'This week';
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
}

export interface BadgeInfo {
  label: string;
  tooltip: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
}

export function getBadges(move: {
  lowConfShare: number | null;
  retestDue: boolean;
  lastPracticedWeeks: number;
  primaryReasonCode: string;
}): BadgeInfo[] {
  const badges: BadgeInfo[] = [];
  const LOW_CONF_THRESHOLD = 0.30;
  const STALE_WEEKS = 6;

  // Max 2 badges, same priority as primary reason
  if (move.retestDue) {
    badges.push({
      label: 'RETEST',
      tooltip: 'We scheduled this again to verify improvement',
      variant: 'default',
    });
  }
  
  if (badges.length < 2 && move.lowConfShare !== null && move.lowConfShare >= LOW_CONF_THRESHOLD) {
    badges.push({
      label: 'LOW CONF',
      tooltip: 'A large share of recent scores were 1–2',
      variant: 'destructive',
    });
  }
  
  if (badges.length < 2 && move.lastPracticedWeeks === 999) {
    badges.push({
      label: 'NEVER',
      tooltip: "This pro-move hasn't been practiced yet",
      variant: 'secondary',
    });
  }
  
  if (badges.length < 2 && move.lastPracticedWeeks >= STALE_WEEKS && move.lastPracticedWeeks !== 999) {
    badges.push({
      label: 'STALE',
      tooltip: "Hasn't been practiced in a while",
      variant: 'outline',
    });
  }

  return badges.slice(0, 2); // Ensure max 2
}

export interface FilterState {
  signals?: Array<'lowConf' | 'retest' | 'stale' | 'never'>;
  domains?: string[];
}

export function applyFilters(
  moves: any[],
  filters: FilterState,
  sort: 'need' | 'lowConf' | 'weeks' | 'domain'
): any[] {
  let filtered = [...moves];

  // Apply signal filters
  if (filters.signals && filters.signals.length > 0) {
    filtered = filtered.filter(move => {
      return filters.signals!.some(signal => {
        switch (signal) {
          case 'lowConf':
            return move.lowConfShare !== null && move.lowConfShare >= 0.30;
          case 'retest':
            return move.retestDue === true;
          case 'stale':
            return move.lastPracticedWeeks >= 6 && move.lastPracticedWeeks !== 999;
          case 'never':
            return move.lastPracticedWeeks === 999;
          default:
            return false;
        }
      });
    });
  }

  // Apply domain filters
  if (filters.domains && filters.domains.length > 0) {
    filtered = filtered.filter(move => 
      filters.domains!.includes(move.domainName)
    );
  }

  // Apply sorting
  filtered.sort((a, b) => {
    switch (sort) {
      case 'need':
        return b.finalScore - a.finalScore; // Desc
      case 'lowConf':
        return (b.lowConfShare || 0) - (a.lowConfShare || 0); // Desc
      case 'weeks':
        return b.lastPracticedWeeks - a.lastPracticedWeeks; // Desc (oldest first)
      case 'domain':
        return a.domainName.localeCompare(b.domainName); // A-Z
      default:
        return 0;
    }
  });

  return filtered;
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
