/**
 * Pure calendar-date arithmetic on "yyyy-MM-dd" strings, with NO timezone
 * dependency at all.
 *
 * A date-only string has no time-of-day, so shifting it by N days is
 * unambiguous calendar arithmetic. It must never be done by adding days to
 * a `Date` instant with date-fns' `addDays`: that function mutates a
 * Date's day-of-month using the HOST runtime's own local timezone
 * (`Date.prototype.setDate`/`getDate`), not the target IANA timezone. When
 * the host's DST transitions don't line up with the target timezone's
 * (they never do for a UTC host, since UTC has none), "N host days" is not
 * "N target-timezone calendar days": the arithmetic silently drops or
 * gains an hour, which can spill into a whole day of error once the result
 * is reformatted near midnight in the target zone. See COR-1.
 *
 * `addCalendarDays` sidesteps all of that by working entirely in a
 * UTC-anchored `Date` (via `Date.UTC`/`getUTCDate`/`setUTCDate`, which are
 * DST-free by construction) and never converting to or from an instant in
 * any real timezone.
 */
export function addCalendarDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day));
  anchor.setUTCDate(anchor.getUTCDate() + days);

  const yyyy = anchor.getUTCFullYear();
  const mm = String(anchor.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(anchor.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
