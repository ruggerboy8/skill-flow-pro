// DASH-1a: shared participation color-tier logic for the Command Center.
// Red is reserved for missed-deadline participation problems only (never
// confidence/skill scores). This module is the single source of truth so
// the summary cards, location cards, and signals banner never disagree.

export type ParticipationTier = 'red' | 'watch' | 'neutral' | 'good';

export interface ParticipationTierInput {
  /** Submission/completion rate, 0-100. */
  rate: number;
  /** Count of people currently missing a submission (post-deadline "late" count). */
  missedCount: number;
  /** Total staff in the location (or org, for aggregate cards). */
  teamSize: number;
  /** Whether at least one relevant deadline has passed. */
  anyDeadlinePassed: boolean;
}

const RED_THRESHOLD = 60;
const WATCH_THRESHOLD = 85;
const SMALL_TEAM_MAX_SIZE = 5;
const SMALL_TEAM_MAX_SUBMITTED = 1;
const RED_MIN_MISSED = 3;

/**
 * Decides the participation color tier for a location or org, per DASH-1a.
 *
 * - Before any deadline has passed: always 'neutral' (never red, never amber).
 * - >= 85%: 'good' (default surfaces, no alarm coloring).
 * - 60-84.9%: 'watch' (amber).
 * - < 60%: 'red' only if the small-team guard passes (see
 *   `passesSmallTeamGuard`); otherwise it stays 'watch' so a single absence
 *   in a tiny team never reads as an alarm.
 */
export function participationTier({
  rate,
  missedCount,
  teamSize,
  anyDeadlinePassed,
}: ParticipationTierInput): ParticipationTier {
  if (!anyDeadlinePassed) return 'neutral';
  if (rate >= WATCH_THRESHOLD) return 'good';
  if (rate >= RED_THRESHOLD) return 'watch';
  return passesSmallTeamGuard(missedCount, teamSize) ? 'red' : 'watch';
}

/**
 * A location only goes red if the shortfall is big enough to be a real
 * signal, not a single absence in a small team. Passes when at least 3
 * people are missing, or - for teams too small to ever reach 3 - when the
 * team has 5 or fewer people and at most 1 of them submitted.
 */
export function passesSmallTeamGuard(missedCount: number, teamSize: number): boolean {
  if (missedCount >= RED_MIN_MISSED) return true;
  const submitted = Math.max(teamSize - missedCount, 0);
  return teamSize <= SMALL_TEAM_MAX_SIZE && submitted <= SMALL_TEAM_MAX_SUBMITTED;
}

export interface TierColorTokens {
  text: string;
  bg: string;
  border: string;
}

/**
 * hsl(var(--...)) strings for inline styles, matching the pattern used by
 * StatusBadge. Returns null for 'neutral'/'good' - those tiers use the
 * page's default surface/text colors, not a special token.
 */
export function tierColorTokens(tier: ParticipationTier): TierColorTokens | null {
  if (tier === 'red') {
    return {
      text: 'hsl(var(--status-missing))',
      bg: 'hsl(var(--status-missing-bg))',
      border: 'hsl(var(--status-missing) / 0.3)',
    };
  }
  if (tier === 'watch') {
    return {
      text: 'hsl(var(--status-late))',
      bg: 'hsl(var(--status-late-bg))',
      border: 'hsl(var(--status-late) / 0.3)',
    };
  }
  return null;
}
