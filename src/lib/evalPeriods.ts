/**
 * Utility functions for generating and managing evaluation periods
 */

export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface EvaluationPeriod {
  type: 'Baseline' | 'Quarterly';
  quarter?: Quarter;
  year: number;
}

/**
 * Generate all possible evaluation periods between two years
 * Returns in descending order (most recent first)
 */
export function generateEvalPeriods(startYear: number, endYear: number): EvaluationPeriod[] {
  const periods: EvaluationPeriod[] = [];
  
  // Pin Baseline at the top (using most recent year)
  periods.push({ type: 'Baseline', year: endYear });
  
  // Then quarterly periods in descending order (most recent first)
  for (let year = endYear; year >= startYear; year--) {
    for (const quarter of ['Q4', 'Q3', 'Q2', 'Q1'] as Quarter[]) {
      periods.push({ type: 'Quarterly', quarter, year });
    }
  }
  
  return periods;
}

/**
 * Get current evaluation period based on current date
 */
export function getCurrentEvalPeriod(): EvaluationPeriod {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const quarter = `Q${Math.ceil(month / 3)}` as Quarter;
  
  return { type: 'Quarterly', quarter, year };
}

/**
 * Format evaluation period as display string
 */
export function formatEvalPeriod(period: EvaluationPeriod): string {
  if (period.type === 'Baseline') {
    return `Baseline ${period.year}`;
  }
  return `${period.quarter} ${period.year}`;
}

/**
 * Compare two evaluation periods for sorting
 * Returns positive if a is more recent, negative if b is more recent
 */
export function compareEvalPeriods(a: EvaluationPeriod, b: EvaluationPeriod): number {
  // First compare by year
  if (a.year !== b.year) {
    return b.year - a.year; // More recent first
  }
  
  // Baseline comes after quarterly for the same year
  if (a.type === 'Baseline' && b.type !== 'Baseline') return 1;
  if (b.type === 'Baseline' && a.type !== 'Baseline') return -1;
  
  // Both baseline or both quarterly
  if (a.type === 'Quarterly' && b.type === 'Quarterly' && a.quarter && b.quarter) {
    const quarterOrder = { Q4: 4, Q3: 3, Q2: 2, Q1: 1 };
    return quarterOrder[b.quarter] - quarterOrder[a.quarter]; // Q4 before Q1
  }
  
  return 0;
}

/**
 * Check if two evaluation periods are equal
 */
export function arePeriodsEqual(a: EvaluationPeriod | null, b: EvaluationPeriod | null): boolean {
  if (!a || !b) return false;
  return a.type === b.type && a.year === b.year && a.quarter === b.quarter;
}

/**
 * Parse a period from query string format
 */
export function parsePeriodFromString(str: string): EvaluationPeriod | null {
  // Handle "Baseline-2026" format
  const baselineMatch = str.match(/^Baseline-(\d{4})$/);
  if (baselineMatch) {
    return { type: 'Baseline', year: parseInt(baselineMatch[1]) };
  }
  
  // Handle "Q1-2026" format
  const quarterlyMatch = str.match(/^(Q[1-4])-(\d{4})$/);
  if (quarterlyMatch) {
    return { 
      type: 'Quarterly', 
      quarter: quarterlyMatch[1] as Quarter, 
      year: parseInt(quarterlyMatch[2]) 
    };
  }
  
  return null;
}

/**
 * Serialize period to query string format
 */
export function periodToString(period: EvaluationPeriod): string {
  if (period.type === 'Baseline') {
    return `Baseline-${period.year}`;
  }
  return `${period.quarter}-${period.year}`;
}
