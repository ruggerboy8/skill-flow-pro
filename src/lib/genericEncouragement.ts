/**
 * Rotating generic-encouragement copy for the Home recognition card when a
 * staff member has no glow yet (MOB-5, spec open question 2 — recommendation
 * accepted: a small rotating set in the coaching voice, not one static
 * line that would read as a placeholder). Rotates by day-of-year so it's
 * stable across re-renders on the same day but not identical every day.
 */
const ENCOURAGEMENT_LINES = [
  "Keep showing up. Recognition catches up with consistency, and yours is building.",
  "Nothing to show here yet, but that's about timing, not effort. Keep going.",
  "Your coach is watching for moments worth calling out. One's coming.",
  "The work you're putting in doesn't go unnoticed for long. Hang tight.",
] as const;

function dayOfYear(date: Date): number {
  // UTC throughout so the rotation is stable across a given calendar day
  // regardless of the caller's local timezone.
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diffMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** Picks one encouragement line, rotating by day-of-year. */
export function pickEncouragementLine(date: Date = new Date()): string {
  const index = dayOfYear(date) % ENCOURAGEMENT_LINES.length;
  return ENCOURAGEMENT_LINES[index];
}
