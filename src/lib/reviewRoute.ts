/**
 * Feature flag + route helper for the rebuilt staff review (V2).
 *
 * Conservative migration: the classic wizard (/review) stays the default. V2
 * (/review-v2) is reachable when the flag is on, so we can validate it with a
 * subset before promoting it to the canonical route and retiring V1.
 *
 * Toggle in a browser console (persists per browser, survives masquerade):
 *   localStorage.setItem('eval_review_v2', '1')   // opt in to V2
 *   localStorage.setItem('eval_review_v2', '0')   // force V1
 *   localStorage.removeItem('eval_review_v2')      // back to default
 *
 * When ready to cut over for everyone, flip REVIEW_V2_DEFAULT to true (P4).
 */
const REVIEW_V2_DEFAULT = false;

export function reviewV2Enabled(): boolean {
  try {
    const v = localStorage.getItem('eval_review_v2');
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* ignore */
  }
  return REVIEW_V2_DEFAULT;
}

/** Path to the staff review wizard, honoring the V2 flag. */
export function reviewPath(evalId: string): string {
  return `/evaluation/${evalId}/review${reviewV2Enabled() ? '-v2' : ''}`;
}
