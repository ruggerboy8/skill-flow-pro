import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export interface V2Anchors {
  mondayZ: Date;
  checkin_open: Date;            // Mon 00:00 local tz
  checkin_due: Date;             // Tue 12:00 local tz
  checkout_open: Date;           // Thu 00:01 local tz
  checkout_due: Date;            // Fri 17:00 local tz
  week_end: Date;                // Sun 23:59:59 local tz
}

function toZonedStart(now: Date, tz: string): Date {
  const isoDow = Number(formatInTimeZone(now, tz, 'i')); // 1=Mon..7=Sun
  const todayMidnightUtc = fromZonedTime(
    `${formatInTimeZone(now, tz, 'yyyy-MM-dd')}T00:00:00`,
    tz
  );
  return addDays(todayMidnightUtc, -(isoDow - 1)); // Monday 00:00 as UTC instant
}

function z(tzDayUtc: Date, hhmmss: string, tz: string): Date {
  return fromZonedTime(
    `${formatInTimeZone(tzDayUtc, tz, 'yyyy-MM-dd')}T${hhmmss}`,
    tz
  );
}

export function getWeekAnchors(now: Date, tz: string): V2Anchors {
  const mondayZ = toZonedStart(now, tz);
  return {
    mondayZ,
    checkin_open: z(mondayZ, '00:00:00', tz),
    checkin_due: z(addDays(mondayZ, 1), '15:00:00', tz),         // Tue 15:00 (3pm)
    checkout_open: z(addDays(mondayZ, 3), '00:01:00', tz),       // Thu 00:01
    checkout_due: z(addDays(mondayZ, 4), '15:00:00', tz),        // Fri 15:00 (3pm)
    week_end: z(addDays(mondayZ, 6), '23:59:59', tz),            // Sun 23:59:59
  };
}