/**
 * Pure tiered selection logic for the Home recognition card's featured glow
 * (MOB-5). See docs/specs/mob-5-recognition-card.md, "The selection rule".
 *
 * Tier 1: the most recent glow in the staff member's lowest-confidence
 *         domain.
 * Tier 2: if none there (or there's no usable confidence data at all — a
 *         new hire), the most recent glow in any domain.
 * Tier 3: if there are no glows at all, null. The Home card then renders
 *         generic encouragement; Performance renders an inviting empty
 *         state. Never a stack of every glow.
 */

export interface GlowCandidate {
  /** `evaluation_items.observer_glow` — always non-empty for a candidate. */
  observerGlow: string;
  domainName: string | null;
  /** Giver's name, resolved elsewhere. Null when it could not be resolved —
   *  callers must render without a name rather than guess (spec risk
   *  mitigation: "Attribution correctness"). */
  giverName: string | null;
  /** ISO timestamp used for "most recent" ordering (observed_at/created_at
   *  of the parent evaluation). */
  recencyDate: string;
}

/**
 * Picks the single featured glow from a list of candidates, newest first
 * within whichever tier applies. Does not mutate the input array.
 */
export function selectFeaturedGlow<T extends GlowCandidate>(
  glows: T[],
  lowestConfidenceDomain: string | null
): T | null {
  if (glows.length === 0) return null;

  const sorted = [...glows].sort(
    (a, b) => new Date(b.recencyDate).getTime() - new Date(a.recencyDate).getTime()
  );

  if (lowestConfidenceDomain) {
    const inDomain = sorted.find((g) => g.domainName === lowestConfidenceDomain);
    if (inDomain) return inDomain;
  }

  // Tier 2: no glow in the lowest-confidence domain, or no confidence data
  // to pick one from at all (lowestConfidenceDomain is null).
  return sorted[0];
}
