// Date and data formatting utilities for sequencer

export function formatMmDdYyyy(isoDate: string): string {
  const d = new Date(isoDate);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

export function formatWeeksSince(isoDate: string, referenceDate: string): number {
  const d1 = new Date(isoDate);
  const d2 = new Date(referenceDate);
  const diffMs = d2.getTime() - d1.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks;
}

export function getMonday(date: Date, timezone: string): Date {
  // Get the Monday of the week containing this date
  const d = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
  return new Date(d.setDate(diff));
}

export function addWeeks(date: Date, weeks: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + weeks * 7);
  return result;
}

export function toIsoDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}
