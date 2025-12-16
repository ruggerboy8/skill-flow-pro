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

// Helper: build a UTC instant for any timezone
function ctUtcForTz(dayRefUtc: Date, timeHHMMSS: string, tz: string): Date {
  const dayStr = formatInTimeZone(dayRefUtc, tz, 'yyyy-MM-dd'); // timezone calendar date
  // Convert "that timezone wall time" into a UTC instant
  return fromZonedTime(`${dayStr}T${timeHHMMSS}`, tz);
}

export function getAnchors(now: Date = nowUtc()) {
  // ISO weekday in CT: 1=Mon..7=Sun
  const isoDow = Number(formatInTimeZone(now, CT_TZ, 'i'));
  // Get CT "today" at 00:00 as a UTC instant
  const todayMidnightCtUtc = ctUtcFor(now, '00:00:00');
  // Roll back to Monday 00:00 CT (as UTC instant)
  const mondayZ = addDays(todayMidnightCtUtc, -(isoDow - 1));

  const monCheckInZ = ctUtcFor(mondayZ, '09:00:00');           // Mon 09:00 CT
  const tueDueZ     = ctUtcFor(addDays(mondayZ, 1), '14:00:00'); // Tue 14:00 CT (2pm)
  const thuStartZ   = ctUtcFor(addDays(mondayZ, 3), '00:00:00'); // Thu 00:00 CT
  const friStartZ   = ctUtcFor(addDays(mondayZ, 4), '00:00:00'); // Fri 00:00 CT
  const sunEndZ     = ctUtcFor(addDays(mondayZ, 6), '23:59:59'); // Sun 23:59:59 CT

  return { mondayZ, monCheckInZ, tueDueZ, thuStartZ, friStartZ, sunEndZ };
}

// Enhanced anchors with all time windows for current week
// Enhanced anchors with all time windows for current week
export function getWeekAnchors(now: Date = nowUtc(), tz: string = CT_TZ) {
  // ISO weekday in specified timezone: 1=Mon..7=Sun
  const isoDow = Number(formatInTimeZone(now, tz, 'i'));
  // Get timezone "today" at 00:00 as a UTC instant
  const todayMidnightUtc = ctUtcForTz(now, '00:00:00', tz);
  // Roll back to Monday 00:00 in timezone (as UTC instant)
  const mondayZ = addDays(todayMidnightUtc, -(isoDow - 1));

  const checkin_open = ctUtcForTz(mondayZ, '00:00:00', tz);           // Mon 00:00 TZ
  const confidence_deadline = ctUtcForTz(addDays(mondayZ, 1), '14:00:00', tz); // Tue 14:00 TZ (2pm)
  const checkout_open = ctUtcForTz(addDays(mondayZ, 3), '00:01:00', tz); // Thu 00:01 TZ
  const performance_deadline = ctUtcForTz(addDays(mondayZ, 4), '17:00:00', tz); // Fri 17:00 TZ
  const week_end = ctUtcForTz(addDays(mondayZ, 6), '23:59:59', tz); // Sun 23:59:59 TZ

  return { 
    checkin_open, 
    confidence_deadline, 
    checkout_open, 
    performance_deadline, 
    week_end,
    // Legacy compatibility
    mondayZ, 
    monCheckInZ: ctUtcForTz(mondayZ, '09:00:00', tz), 
    tueDueZ: confidence_deadline, 
    thuStartZ: checkout_open, 
    friStartZ: ctUtcForTz(addDays(mondayZ, 4), '00:00:00', tz), 
    sunEndZ: week_end
  };
}

// For friendly dates like “Mon, Aug 25”
export function nextMondayStr(now: Date = nowUtc()) {
  const { monCheckInZ } = getAnchors(now);
  const nextMon = addDays(monCheckInZ, 7);
  return formatInTimeZone(nextMon, CT_TZ, 'EEE, MMM d');
}
