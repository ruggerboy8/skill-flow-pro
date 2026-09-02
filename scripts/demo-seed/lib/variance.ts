/**
 * Variance pass: reshapes copied confidence scores per domain per location
 * so Clip 3 (the org-wide domain confidence view) shows believable highs
 * and lows across the 4 domains and 3 locations, instead of whatever flat
 * or sparse pattern the single copied source location happened to have.
 *
 * Deliberately deterministic (no Math.random / no wall-clock seed): the
 * same input always produces the same output, so re-running the seed
 * script does not quietly reshuffle the story the demo tells.
 */

export interface ScoreLike {
  staffId: string;
  locationId: string;
  domainId: number;
  weekOf: string;
  confidenceScore: number | null;
}

const MIN_SCORE = 1;
const MAX_SCORE = 4;

/**
 * Four target means spread across the 1-4 scale: one clearly low, one
 * clearly high, two in between. `domainLocationTargetMean` below picks
 * among these per (domain, location) pair.
 */
const VARIANCE_BANDS: readonly number[] = [1.8, 2.6, 3.0, 3.7];

/**
 * Deterministic target mean confidence for one domain at one location.
 * `domainIndex` / `locationIndex` are positions in the caller's own sorted
 * domain-id / location-id lists (0-based), not database ids, so the
 * pattern is stable regardless of what the actual ids are.
 *
 * The `(domainIndex * 2 + locationIndex) % 4` formula is chosen only to
 * spread the 4 bands across a small domain x location grid without every
 * domain landing on the same band at every location (which would read as
 * "every location is identical") and without every location showing the
 * same band across all its domains (which would read as "this location
 * has no weak spots"). It repeats every 2 domains, which is fine for the
 * 4 real domains this app has.
 */
export function domainLocationTargetMean(domainIndex: number, locationIndex: number): number {
  const bandIndex = (domainIndex * 2 + locationIndex) % VARIANCE_BANDS.length;
  return VARIANCE_BANDS[bandIndex];
}

/** Clamp to the app's 1-4 confidence scale and round to a whole number. */
function clampScore(value: number): number {
  return Math.min(MAX_SCORE, Math.max(MIN_SCORE, Math.round(value)));
}

/**
 * Small deterministic pseudo-random value in [0, 1) derived from a string
 * seed (FNV-1a-ish hash). Not cryptographic, not `Math.random` -- exists
 * only to give per-row jitter so a shaped domain/location bucket doesn't
 * come out perfectly uniform (the spec calls out "not uniform" explicitly).
 */
function seededUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Reshapes every score in `scores` toward its (domain, location) target
 * mean, with deterministic per-row jitter so the result has visible spread
 * rather than collapsing to one repeated value. `domainOrder` /
 * `locationOrder` fix the index each id maps to for
 * `domainLocationTargetMean`, so callers control the band assignment
 * (e.g. sorted by id) rather than relying on Map iteration order.
 *
 * Rows with a null `confidenceScore` (never submitted) are left untouched
 * -- variance shaping only reshapes scores that exist, it never invents a
 * submission that was not there.
 */
export function shapeVariance(
  scores: readonly ScoreLike[],
  domainOrder: readonly number[],
  locationOrder: readonly string[],
): ScoreLike[] {
  const domainIndex = new Map(domainOrder.map((d, i) => [d, i]));
  const locationIndex = new Map(locationOrder.map((l, i) => [l, i]));

  return scores.map((s) => {
    if (s.confidenceScore === null) return s;

    const dIdx = domainIndex.get(s.domainId);
    const lIdx = locationIndex.get(s.locationId);
    if (dIdx === undefined || lIdx === undefined) return s;

    const target = domainLocationTargetMean(dIdx, lIdx);
    const jitter = (seededUnit(`${s.staffId}:${s.domainId}:${s.weekOf}`) - 0.5) * 1.6; // +/-0.8
    return { ...s, confidenceScore: clampScore(target + jitter) };
  });
}
