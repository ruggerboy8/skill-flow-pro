/**
 * Rotating generic-encouragement copy for the Home recognition card when a
 * staff member has no glow yet (MOB-5, spec open question 2 — recommendation
 * accepted: a small rotating set in the coaching voice, not one static
 * line that would read as a placeholder). Rotates by day-of-year so it's
 * stable across re-renders on the same day but not identical every day.
 */
const ENCOURAGEMENT_LINES = [
  "Every Pro Move you rate honestly is you getting a little better at this.",
  "The work you put in this week adds up, one patient at a time.",
  "Getting stronger at your craft is the whole point, and you're doing it.",
  "Small moves, done consistently, are what great looks like here.",
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
