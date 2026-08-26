// Pure helpers behind a typeable MM/DD/YYYY date field -- used instead of a
// native <input type="date">, which forces an unwanted scroll-wheel picker on
// iOS. See CLAUDE.md-adjacent product note: no native date pickers.

/**
 * As the user types digits, auto-insert the "/" separators of MM/DD/YYYY.
 * Non-digit characters are stripped; input beyond 8 digits is ignored.
 */
export function maskDateInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter((p) => p.length > 0);
  return parts.join('/');
}

/**
 * Parses a complete "MM/DD/YYYY" display string into a "YYYY-MM-DD" date
 * string, or null if it isn't a complete, calendar-valid date yet (e.g. still
 * being typed, or day-of-month out of range for that month).
 */
export function parseTypedDate(display: string): string | null {
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const month = Number(mm);
  const day = Number(dd);
  const year = Number(yyyy);
  if (month < 1 || month > 12) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** The inverse of parseTypedDate: "YYYY-MM-DD" -> "MM/DD/YYYY" for display. */
export function formatDateForDisplay(isoDate: string): string {
  const [yyyy, mm, dd] = isoDate.split('-');
  return `${mm}/${dd}/${yyyy}`;
}
