// Timezone utilities for Pro-Move Planner
// All planner logic uses America/Chicago timezone

const PLANNER_TZ = 'America/Chicago';

/**
 * Get the Monday of the week containing the given date in America/Chicago timezone
 */
export function getChicagoMonday(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(date + 'T12:00:00') : date;
  
  // Convert to Chicago timezone
  const chicagoDateStr = d.toLocaleString('en-US', { timeZone: PLANNER_TZ });
  const chicagoDate = new Date(chicagoDateStr);
  
  // Get the day of week (0 = Sunday, 1 = Monday, ...)
  const dayOfWeek = chicagoDate.getDay();
  
  // Calculate days to subtract to get to Monday (0=Sun needs -6, 1=Mon needs 0, 2=Tue needs -1, etc.)
  const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  
  // Get Monday
  const monday = new Date(chicagoDate);
  monday.setDate(chicagoDate.getDate() + daysToMonday);
  
  // Format as yyyy-MM-dd
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const day = String(monday.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Normalize any date input to a Chicago Monday string (YYYY-MM-DD)
 * Use this as the single source of truth for all planner date operations
 */
export function normalizeToPlannerWeek(input: Date | string): string {
  return getChicagoMonday(input);
}

/**
 * Check if a date string (yyyy-MM-dd) is a Monday in America/Chicago timezone
 */
export function isMondayChicago(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00');
  const chicagoDateStr = date.toLocaleString('en-US', { timeZone: PLANNER_TZ });
  const chicagoDate = new Date(chicagoDateStr);
  
  return chicagoDate.getDay() === 1;
}

/**
 * Get next Monday from now in America/Chicago timezone
 */
export function getNextMondayChicago(): string {
  const now = new Date();
  const chicagoNowStr = now.toLocaleString('en-US', { timeZone: PLANNER_TZ });
  const chicagoNow = new Date(chicagoNowStr);
  
  // Get days until next Monday
  const dayOfWeek = chicagoNow.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  
  const nextMonday = new Date(chicagoNow);
  nextMonday.setDate(chicagoNow.getDate() + daysUntilMonday);
  
  const year = nextMonday.getFullYear();
  const month = String(nextMonday.getMonth() + 1).padStart(2, '0');
  const day = String(nextMonday.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Format a date string (yyyy-MM-dd) as a display string
 */
export function formatWeekOf(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric',
    timeZone: PLANNER_TZ
  });
}

/**
 * Calculate weeks ago from a date string to now
 */
export function weeksAgo(dateStr: string): number {
  const date = new Date(dateStr + 'T12:00:00');
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks;
}
