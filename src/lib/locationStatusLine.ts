import type { ParticipationTier } from '@/lib/participationTier';

/**
 * DASH-2: one quiet, dot-separated fact per LocationHealthCard status line.
 * `icon` marks the two accent treatments the spec allows (never a filled
 * pill): 'check' for a clean post-deadline "all in" week, and 'late' for
 * the late-straggler amendment (John, 2026-08-26) - a light --status-late
 * accent (icon + colored text) on an otherwise calm card so a straggler
 * catches the eye on a scan without reading as an alarm.
 */
export interface StatusPhrase {
  text: string;
  icon?: 'check' | 'late';
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
 *
 * Late-straggler amendment (John, 2026-08-26): on a good/neutral card - one
 * with no chip already carrying the alarm - a late count gets a light
 * `--status-late` accent (icon: 'late') instead of staying fully muted, so
 * it catches the eye on a scan without reading as an alarm. Watch and red
 * tiers already carry that alarm via their chip and wash, so their late
 * phrases stay plain/muted here.
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

  const accent = tier === 'good' || tier === 'neutral';
  const phrases: StatusPhrase[] = [];
  if (missingConfCount > 0) {
    phrases.push(
      accent
        ? { text: `${missingConfCount} late (conf)`, icon: 'late' }
        : { text: `${missingConfCount} late (conf)` },
    );
  }
  if (missingPerfCount > 0) {
    phrases.push(
      accent
        ? { text: `${missingPerfCount} late (perf)`, icon: 'late' }
        : { text: `${missingPerfCount} late (perf)` },
    );
  }
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
