import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { startOfISOWeek, addDays, set } from 'date-fns';

export function getCoachDeadlines(now: Date, tz: string) {
  const local = toZonedTime(now, tz);
  const monday = startOfISOWeek(local); // local Monday 00:00
  const confDueLocal = set(monday, { hours: 23, minutes: 59, seconds: 59, milliseconds: 0 });
  const thursday = addDays(monday, 3);
  const perfDueLocal = set(thursday, { hours: 23, minutes: 59, seconds: 59, milliseconds: 0 });
  return {
    confDue: fromZonedTime(confDueLocal, tz),
    perfDue: fromZonedTime(perfDueLocal, tz),
  };
}