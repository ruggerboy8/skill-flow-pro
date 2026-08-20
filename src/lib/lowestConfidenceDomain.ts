import { DOMAIN_ORDER } from './content/roleDefinitions';

/**
 * Pure aggregation + selection logic behind "the lowest-confidence domain"
 * (MOB-5). Extracted from `ConfidenceCard`'s inline `domainAverages` reduce
 * so the card and the glow selector (`useLowestConfidenceDomain`,
 * `useStaffGlows`) share one code path and cannot drift — see
 * docs/specs/mob-5-recognition-card.md, acceptance criterion 4.
 */

export interface DomainScoreRow {
  domain_name: string;
  confidence_score: number | null;
}

export interface DomainAverageEntry {
  sum: number;
  count: number;
}

/**
 * Sums `confidence_score` by `domain_name` over a set of weekly-score rows.
 * Rows with a null score are skipped (matches ConfidenceCard's original
 * behavior: only scored rows count toward the average).
 */
export function computeDomainAverages(rows: DomainScoreRow[]): Map<string, DomainAverageEntry> {
  const map = new Map<string, DomainAverageEntry>();
  for (const row of rows) {
    if (row.confidence_score == null) continue;
    const entry = map.get(row.domain_name) ?? { sum: 0, count: 0 };
    entry.sum += row.confidence_score;
    entry.count += 1;
    map.set(row.domain_name, entry);
  }
  return map;
}

/**
 * Picks the domain with the lowest average `confidence_score`.
 *
 * Tie-break: when two or more domains share the lowest average, the one
 * that appears first in `DOMAIN_ORDER` (Clinical, Clerical, Cultural, Case
 * Acceptance) wins, so the result is deterministic instead of depending on
 * Map insertion order. A domain outside the standard four sorts after all
 * four and ties are then broken by whichever was encountered first.
 *
 * Returns null when there is no domain with at least one scored row (new
 * hire / sparse data) — callers must treat that as "no confidence data"
 * and fall back accordingly, never error.
 */
export function pickLowestConfidenceDomain(
  domainAverages: Map<string, DomainAverageEntry>
): string | null {
  let best: { domain: string; average: number } | null = null;

  for (const [domain, { sum, count }] of domainAverages) {
    if (count === 0) continue;
    const average = sum / count;

    if (!best || average < best.average) {
      best = { domain, average };
      continue;
    }

    if (average === best.average) {
      const currentRank = domainRank(domain);
      const bestRank = domainRank(best.domain);
      if (currentRank < bestRank) {
        best = { domain, average };
      }
    }
  }

  return best?.domain ?? null;
}

function domainRank(domain: string): number {
  const idx = (DOMAIN_ORDER as readonly string[]).indexOf(domain);
  return idx === -1 ? DOMAIN_ORDER.length : idx;
}
