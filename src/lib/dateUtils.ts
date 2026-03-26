/**
 * Returns the date string (YYYY-MM-DD) for the upcoming Monday in the given
 * IANA timezone. If today is already Monday, returns next Monday (7 days out)
 * to ensure program start is always in the future.
 *
 * Uses Intl.DateTimeFormat to determine the day-of-week in the target timezone
 * rather than relying on the browser's local time, which avoids off-by-one
 * errors when the platform admin is in a different timezone than the location.
 *
 * @param ianaTimezone - e.g. 'America/New_York', 'Europe/London'
 */
export function nextMondayInTimezone(ianaTimezone: string): string {
  const now = new Date();

  // Get the current day-of-week in the target timezone (0=Sun, 1=Mon, ..., 6=Sat)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaTimezone,
    weekday: 'short',
  });
  const weekdayStr = formatter.format(now); // e.g. "Mon", "Tue"

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = weekdayMap[weekdayStr] ?? now.getDay();

  // Always advance to the *next* Monday (never today, even if today is Monday)
  const daysUntilMonday = dayOfWeek === 1 ? 7 : ((8 - dayOfWeek) % 7) || 7;

  const monday = new Date(now);
  monday.setDate(now.getDate() + daysUntilMonday);

  // Format the date in the target timezone to avoid UTC-date-shift issues
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: ianaTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return dateFormatter.format(monday); // Returns YYYY-MM-DD (en-CA locale)
}
