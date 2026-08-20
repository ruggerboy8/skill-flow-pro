import type { SubmissionStatus } from '@/components/ui/StatusBadge';

/**
 * Maps "days since last eval" onto the same complete/late/missing status
 * tokens used elsewhere in the app, so the Evaluation Cadence widget's
 * good/due-soon/overdue tiers render with identical colors to every other
 * screen (DSN-4). Extracted from EvalCadenceWidget so this pure mapping can
 * be unit tested on its own.
 */
export function cadenceStatus(daysSince: number | null): SubmissionStatus {
  if (daysSince === null) return 'missing';
  if (daysSince > 90) return 'missing';
  if (daysSince > 60) return 'late';
  return 'complete';
}

export function cadenceLabel(daysSince: number | null): string {
  if (daysSince === null) return 'No eval on record';
  return `${daysSince}d ago`;
}
