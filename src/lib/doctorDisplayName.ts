/**
 * Prepend "Dr." to a doctor's name if it doesn't already start with "Dr."
 */
export function drName(name: string | undefined | null): string {
  if (!name) return 'Dr.';
  const trimmed = name.trim();
  if (/^dr\.?\s/i.test(trimmed)) return trimmed;
  return `Dr. ${trimmed}`;
}

/**
 * Strip a single leading "Dr." or "Doctor" token from a name before writing
 * it to the DB. The app always renders doctors with a "Dr." prefix, so any
 * user-entered prefix would double up ("Dr. Dr. Smith"). Mirrors the
 * normalize_doctor_name() Postgres trigger on public.staff.
 */
export function normalizeDoctorName(name: string | undefined | null): string {
  if (!name) return '';
  return name.trim().replace(/^(dr\.?|doctor\.?)\s+/i, '').trim();
}
