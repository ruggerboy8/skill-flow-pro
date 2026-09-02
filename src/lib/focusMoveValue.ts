/**
 * Pure fallback-selection logic for the Home focus-move value card (MOB-3).
 *
 * Resource reality (audited 2026-08-20): a script/audio resource exists for
 * only ~16% of ProMoves (Front Desk + Dental Assistant roles only);
 * `description` covers 96.8% and `action_statement` covers 100%. So for most
 * staff this resolves to the description tier, and for role-4 (Doctor) staff
 * it always does, since `doctor_*` content is intentionally not wired here
 * (John, 2026-08-20: keep doctors on the description tier for v1).
 *
 * Order: script -> audio -> description -> action_statement. The label
 * always matches what the card actually shows — never "Listen" or "Read the
 * script" over plain text.
 */

export type FocusValueTier = 'script' | 'audio' | 'description' | 'statement';

export interface FocusValueSelection {
  tier: FocusValueTier;
  /** CTA/label copy for the tier. Matches what the card shows — never
   *  promises audio or a script when the content is plain text. */
  label: string;
}

export interface FocusValueResourceInputs {
  /** `content_md` from an active `pro_move_resources` row of type 'script'. */
  script?: string | null;
  /** Resolved public URL for an active `pro_move_resources` row of type 'audio'. */
  audioUrl?: string | null;
  /** `pro_moves.description` (long-form). */
  description?: string | null;
  /** `pro_moves.action_statement` (one-line, ~100% coverage). */
  actionStatement?: string | null;
}

const TIER_LABELS: Record<FocusValueTier, string> = {
  script: 'Read the script',
  audio: 'Listen',
  description: 'How to do this move',
  statement: 'How to do this move',
};

/**
 * Picks the best available content tier for the focus-move value card.
 * Returns null only when every field is empty/whitespace (should not happen
 * in practice, since `action_statement` has ~100% coverage) — callers must
 * treat null as "nothing to show" rather than rendering an empty shell.
 */
export function selectFocusMoveValueTier(
  input: FocusValueResourceInputs
): FocusValueSelection | null {
  const script = input.script?.trim();
  if (script) {
    return { tier: 'script', label: TIER_LABELS.script };
  }

  const audioUrl = input.audioUrl?.trim();
  if (audioUrl) {
    return { tier: 'audio', label: TIER_LABELS.audio };
  }

  const description = input.description?.trim();
  if (description) {
    return { tier: 'description', label: TIER_LABELS.description };
  }

  const statement = input.actionStatement?.trim();
  if (statement) {
    return { tier: 'statement', label: TIER_LABELS.statement };
  }

  return null;
}
