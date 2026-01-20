export type EvaluationPeriodType = 'Baseline' | 'Quarterly';
export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface EvaluationPeriod {
  type: EvaluationPeriodType;
  quarter?: Quarter;  // Required when type is 'Quarterly'
  year: number;
}

export interface EvalFilters {
  organizationId: string;
  evaluationPeriod: EvaluationPeriod;
  locationIds: string[];
  roleIds: number[];
  includeNoEvals: boolean;
  windowDays: number;
}

/**
 * Convert an evaluation period to a date range for RPC calls.
 * Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec
 * Baseline returns the full year range.
 */
export function periodToDateRange(period: EvaluationPeriod): { start: Date; end: Date } {
  const year = period.year;
  
  if (period.type === 'Baseline') {
    // Baseline evaluations: full year
    return {
      start: new Date(year, 0, 1),  // Jan 1
      end: new Date(year, 11, 31, 23, 59, 59)  // Dec 31
    };
  }
  
  // Quarterly
  const quarterMap: Record<Quarter, { startMonth: number; endMonth: number }> = {
    Q1: { startMonth: 0, endMonth: 2 },   // Jan-Mar
    Q2: { startMonth: 3, endMonth: 5 },   // Apr-Jun
    Q3: { startMonth: 6, endMonth: 8 },   // Jul-Sep
    Q4: { startMonth: 9, endMonth: 11 }   // Oct-Dec
  };
  
  const quarter = period.quarter || 'Q1';
  const { startMonth, endMonth } = quarterMap[quarter];
  
  return {
    start: new Date(year, startMonth, 1),
    end: new Date(year, endMonth + 1, 0, 23, 59, 59)  // Last day of end month
  };
}

/**
 * Get a display label for the evaluation period
 */
export function getPeriodLabel(period: EvaluationPeriod): string {
  if (period.type === 'Baseline') {
    return `Baseline ${period.year}`;
  }
  return `${period.quarter} ${period.year}`;
}

/**
 * Compare two evaluation periods for sorting.
 * Returns negative if a comes before b (older), positive if a comes after b (newer).
 * Sorted newest first when used with sort().
 */
export function comparePeriods(a: EvaluationPeriod, b: EvaluationPeriod): number {
  // First compare years (descending - newer first)
  if (a.year !== b.year) {
    return b.year - a.year;
  }
  
  // Same year - compare by period type/quarter
  // Order within year: Q4 > Q3 > Q2 > Q1 > Baseline
  const getPeriodWeight = (p: EvaluationPeriod): number => {
    if (p.type === 'Baseline') return 0;
    const quarterWeights: Record<Quarter, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
    return quarterWeights[p.quarter || 'Q1'];
  };
  
  return getPeriodWeight(b) - getPeriodWeight(a);
}

/**
 * Check if two evaluation periods are equal
 */
export function periodsEqual(a: EvaluationPeriod, b: EvaluationPeriod): boolean {
  if (a.type !== b.type || a.year !== b.year) return false;
  if (a.type === 'Quarterly') {
    return a.quarter === b.quarter;
  }
  return true;
}
