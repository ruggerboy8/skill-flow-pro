import type { EvaluationPeriod, Quarter } from '@/types/analytics';

/**
 * Get the start date for a given evaluation period.
 * Used to determine eligibility: staff hired BEFORE this date are eligible.
 */
export function getPeriodStartDate(period: EvaluationPeriod): Date {
  const year = period.year;

  if (period.type === 'Baseline') {
    // For baseline, use Jan 1 of the year as the anchor
    // This means anyone hired before this year is eligible
    return new Date(year, 0, 1);
  }

  // For quarterly: staff hired before the start of the quarter are eligible
  const quarterStartMonths: Record<Quarter, number> = {
    Q1: 0,  // Jan
    Q2: 3,  // Apr
    Q3: 6,  // Jul
    Q4: 9   // Oct
  };

  const startMonth = quarterStartMonths[period.quarter || 'Q1'];
  return new Date(year, startMonth, 1);
}

/**
 * Check if a staff member is eligible for evaluation based on hire date.
 * Eligibility rule: hired BEFORE the start of the evaluation period.
 * 
 * Example: For Q2 2026, staff hired before April 1, 2026 are eligible.
 */
export function isEligibleByHireDate(hireDate: Date | string, period: EvaluationPeriod): boolean {
  const periodStart = getPeriodStartDate(period);
  const hire = typeof hireDate === 'string' ? new Date(hireDate) : hireDate;
  
  // Eligible if hired BEFORE the period starts
  return hire < periodStart;
}

/**
 * Calculate eligible staff for an evaluation period.
 * 
 * Eligible = Union of:
 * 1. Staff hired before the period start (tenure rule)
 * 2. Staff who have any evaluation (draft or submitted) in the period (explicit eval)
 * 
 * This ensures:
 * - The denominator is never 0 when there's evaluation data
 * - Anyone evaluated "early" still counts toward eligibility
 */
export function computeEligibleStaffIds(
  allStaff: { id: string; hire_date: string }[],
  evaluatedStaffIds: Set<string>,
  period: EvaluationPeriod
): Set<string> {
  const eligible = new Set<string>();

  // Add staff eligible by hire date
  for (const staff of allStaff) {
    if (isEligibleByHireDate(staff.hire_date, period)) {
      eligible.add(staff.id);
    }
  }

  // Union with explicitly evaluated staff (anyone with an eval = eligible)
  for (const staffId of evaluatedStaffIds) {
    eligible.add(staffId);
  }

  return eligible;
}
