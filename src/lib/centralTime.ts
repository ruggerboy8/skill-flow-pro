import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const CT_TZ = 'America/Chicago';

// Always use plain Date.now() for comparisons (UTC instant)
export function nowUtc(): Date {
  return new Date();
}

// Helper: build a UTC instant for a given CT calendar day and time
function ctUtcFor(dayRefUtc: Date, timeHHMMSS: string): Date {
  const dayStr = formatInTimeZone(dayRefUtc, CT_TZ, 'yyyy-MM-dd'); // CT calendar date
  // Convert "that CT wall time" into a UTC instant
  return fromZonedTime(`${dayStr}T${timeHHMMSS}`, CT_TZ);
}

export function getAnchors(now: Date = nowUtc()) {
  // ISO weekday in CT: 1=Mon..7=Sun
  const isoDow = Number(formatInTimeZone(now, CT_TZ, 'i'));
  // Get CT "today" at 00:00 as a UTC instant
  const todayMidnightCtUtc = ctUtcFor(now, '00:00:00');
  // Roll back to Monday 00:00 CT (as UTC instant)
  const mondayZ = addDays(todayMidnightCtUtc, -(isoDow - 1));

  const monCheckInZ = ctUtcFor(mondayZ, '09:00:00');           // Mon 09:00 CT
  const tueDueZ     = ctUtcFor(addDays(mondayZ, 1), '12:00:00'); // Tue 12:00 CT
  const thuStartZ   = ctUtcFor(addDays(mondayZ, 3), '00:00:00'); // Thu 00:00 CT
  const friStartZ   = ctUtcFor(addDays(mondayZ, 4), '00:00:00'); // Fri 00:00 CT
  const sunEndZ     = ctUtcFor(addDays(mondayZ, 6), '23:59:59'); // Sun 23:59:59 CT

  return { mondayZ, monCheckInZ, tueDueZ, thuStartZ, friStartZ, sunEndZ };
}

// For friendly dates like “Mon, Aug 25”
export function nextMondayStr(now: Date = nowUtc()) {
  const { monCheckInZ } = getAnchors(now);
  const nextMon = addDays(monCheckInZ, 7);
  return formatInTimeZone(nextMon, CT_TZ, 'EEE, MMM d');
}
