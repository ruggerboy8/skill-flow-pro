/**
 * Prepend "Dr." to a doctor's name if it doesn't already start with "Dr."
 */
export function drName(name: string | undefined | null): string {
  if (!name) return 'Dr.';
  const trimmed = name.trim();
  if (/^dr\.?\s/i.test(trimmed)) return trimmed;
  return `Dr. ${trimmed}`;
}
