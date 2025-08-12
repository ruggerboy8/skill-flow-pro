import { startOfWeek, addDays, setHours, setMinutes, setSeconds, setMilliseconds, getISOWeek, getISOWeekYear } from 'date-fns';
import { toZonedTime, formatInTimeZone } from 'date-fns-tz';

export const CT_TZ = 'America/Chicago';

export function getNowZ(now: Date = new Date()) {
  return toZonedTime(now, CT_TZ);
}

export function getAnchors(nowZ: Date) {
  const mondayZ = startOfWeek(nowZ, { weekStartsOn: 1 });
  const monCheckInZ = setMinutes(setHours(mondayZ, 9), 0); // Mon 09:00 CT
  const tueDueZ = setMinutes(setHours(addDays(mondayZ, 1), 12), 0); // Tue 12:00 CT
  const thuStartZ = setHours(addDays(mondayZ, 3), 0); // Thu 00:00 CT
  const friStartZ = setHours(addDays(mondayZ, 4), 0); // Fri 00:00 CT
  const sunEndZ = setMilliseconds(
    setSeconds(setMinutes(setHours(addDays(mondayZ, 6), 23), 59), 59),
    999
  );
  return { mondayZ, monCheckInZ, tueDueZ, thuStartZ, friStartZ, sunEndZ };
}

export function nextMondayStr(nowZ: Date) {
  const { mondayZ } = getAnchors(nowZ);
  const nextMonZ = addDays(mondayZ, 7);
  return formatInTimeZone(nextMonZ, CT_TZ, 'EEE, MMM d');
}

export function isSameIsoWeek(nowZ: Date, isoYear: number, isoWeek: number) {
  const nowIsoWeek = getISOWeek(nowZ);
  const nowIsoYear = getISOWeekYear(nowZ);
  return nowIsoWeek === isoWeek && nowIsoYear === isoYear;
}
