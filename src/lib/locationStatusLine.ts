import type { ParticipationTier } from '@/lib/participationTier';

/**
 * DASH-2: one quiet, dot-separated fact per LocationHealthCard status line.
 * `icon` is only ever 'check' - the single quiet accent icon the spec
 * allows (never a filled pill) for a clean post-deadline "all in" week.
 */
export interface StatusPhrase {
  text: string;
  icon?: 'check';
}

export interface LocationStatusLineInput {
  /** The card's participation tier (already computed via participationTier). */
  tier: ParticipationTier;
  isFullyExcused: boolean;
  isPartiallyExcused: boolean;
  confExcused: boolean;
  perfExcused: boolean;
  confReason: string | null;
  perfReason: string | null;
  confClosed: boolean;
  perfClosed: boolean;
  perfOpen: boolean;
  /** Staff late on confidence (past its deadline); 0 when confExcused. */
  missingConfCount: number;
  /** Staff late on performance (past its deadline); 0 when perfExcused. */
  missingPerfCount: number;
  /** DISTINCT staff missing anything - a person missing both counts once. */
  distinctMissedCount: number;
  /**
   * Raw "Conf due ..." / "Perf due ..." label from the caller (already
   * computed from the location's submission policy). Reused verbatim for
   * prose - see formatDeadlinePhrase.
   */
  nextDeadlineLabel: string | null;
}

/**
 * Turns the caller's "Conf due Tue 10:00 AM" / "Perf due Fri 5:00 PM" label
 * into card prose: the conf-due case reads naturally as-is (lowercased), but
 * a perf-due label means the performance window is open until that time, so
 * it gets reworded rather than reused literally.
 */
function formatDeadlinePhrase(label: string | null): string | null {
  if (!label) return null;

  const confMatch = label.match(/^Conf due (.+)$/);
  if (confMatch) return `conf due ${confMatch[1]}`;

  const perfMatch = label.match(/^Perf due (.+)$/);
  if (perfMatch) return `perf window open until ${perfMatch[1]}`;

  return label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * Late/missing facts for a single deadline state. Below watch/red, these are
 * quiet "N late (metric)" prose facts (rule 3: facts are prose, not pills).
 * At red, they collapse into one "N people missing" sentence built from the
 * distinct count, per the spec's simplification note.
 */
function missingOrLatePhrases(
  tier: ParticipationTier,
  missingConfCount: number,
  missingPerfCount: number,
  distinctMissedCount: number,
): StatusPhrase[] {
  if (tier === 'red') {
    if (distinctMissedCount <= 0) return [];
    if (missingConfCount > 0 && missingPerfCount > 0) {
      return [
        {
          text: `${distinctMissedCount} people missing: ${missingConfCount} conf, ${missingPerfCount} perf`,
        },
      ];
    }
    const metric = missingConfCount > 0 ? 'conf' : 'perf';
    return [{ text: `${distinctMissedCount} people missing (${metric})` }];
  }

  const phrases: StatusPhrase[] = [];
  if (missingConfCount > 0) phrases.push({ text: `${missingConfCount} late (conf)` });
  if (missingPerfCount > 0) phrases.push({ text: `${missingPerfCount} late (perf)` });
  return phrases;
}

/**
 * The live (non-excused) metric's normal state-rule phrases: late/missing
 * facts, deadline/window context, or "all in" when clean. Identical to what
 * a fully live (non-excused) card would show - a partial excuse only ever
 * adds a reason phrase on top of this, never replaces it (DASH-2 QA fix 3:
 * excused-metric silence must not hide a live metric's stragglers).
 */
function buildLiveMetricPhrases(
  input: Pick<
    LocationStatusLineInput,
    | 'tier'
    | 'confClosed'
    | 'perfClosed'
    | 'perfOpen'
    | 'missingConfCount'
    | 'missingPerfCount'
    | 'distinctMissedCount'
    | 'nextDeadlineLabel'
  >,
): StatusPhrase[] {
  const { tier, confClosed, perfClosed, perfOpen, missingConfCount, missingPerfCount, distinctMissedCount, nextDeadlineLabel } =
    input;
  const anyDeadlinePassed = confClosed || perfClosed;

  // Nothing due yet: the only fact worth a phrase is when the next thing is due.
  if (!anyDeadlinePassed) {
    const phrase = formatDeadlinePhrase(nextDeadlineLabel);
    return phrase ? [{ text: phrase }] : [];
  }

  // Conf closed, perf still open: conf lateness/misses, then the perf window phrase.
  if (confClosed && !perfClosed) {
    const phrases = missingOrLatePhrases(tier, missingConfCount, 0, distinctMissedCount);
    if (perfOpen) {
      const perfPhrase = formatDeadlinePhrase(nextDeadlineLabel);
      if (perfPhrase) phrases.push({ text: perfPhrase });
    }
    return phrases;
  }

  // Both deadlines closed: late/missing facts, or a quiet "all in" when clean.
  const phrases = missingOrLatePhrases(tier, missingConfCount, missingPerfCount, distinctMissedCount);
  if (phrases.length === 0) {
    return [{ text: 'all in', icon: 'check' }];
  }
  return phrases;
}

/**
 * Builds the ordered list of dot-separated status-line phrases for
 * LocationHealthCard (DASH-2). Pure: state in, phrase list out, so the
 * component can render it directly and the state matrix can be unit tested
 * without mounting the card.
 */
export function buildLocationStatusLine(input: LocationStatusLineInput): StatusPhrase[] {
  const { isFullyExcused, isPartiallyExcused, confExcused, confReason, perfReason } = input;

  if (isFullyExcused) {
    return [{ text: 'no submissions required' }];
  }

  // A partial excuse only silences the excused metric's own facts (the
  // caller already zeroes its missing count before calling this function).
  // The live metric still reports its normal state-rule phrases - stragglers
  // on the live metric must never be hidden by the other metric's excuse -
  // with the excuse reason appended last, not substituted in its place.
  const phrases = buildLiveMetricPhrases(input);
  if (isPartiallyExcused) {
    const metric = confExcused ? 'conf' : 'perf';
    const reason = confExcused ? confReason : perfReason;
    phrases.push({ text: reason ? `${metric} excused: ${reason}` : `${metric} excused` });
  }
  return phrases;
}
