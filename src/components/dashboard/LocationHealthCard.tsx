import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, AlertCircle, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { participationTier, tierColorTokens } from "@/lib/participationTier";
import { buildLocationStatusLine } from "@/lib/locationStatusLine";

export interface LocationStats {
  id: string;
  name: string;
  staffCount: number;
  submissionRate: number;      // 0-100 (conf+perf complete %)
  missingConfCount: number;    // staff missing confidence (after deadline - LATE)
  missingPerfCount: number;    // staff missing performance (after deadline - LATE)
  distinctMissedCount: number; // DISTINCT staff missing anything (a person missing both conf and perf counts once)
  pendingConfCount?: number;   // staff not yet submitted but before deadline
  confSubmitted?: number;      // raw count of conf submissions
  confExpected?: number;       // raw count of expected conf submissions
  perfSubmitted?: number;      // raw count of perf submissions
  perfExpected?: number;       // raw count of expected perf submissions
}

export interface ExcuseStatus {
  isConfExcused: boolean;
  isPerfExcused: boolean;
  confReason: string | null;
  perfReason: string | null;
}

export interface SubmissionGates {
  confidenceOpen: boolean;
  confidenceClosed: boolean;
  performanceOpen: boolean;
  performanceClosed: boolean;
}

interface LocationHealthCardProps {
  stats: LocationStats;
  excuseStatus?: ExcuseStatus;
  submissionGates?: SubmissionGates;
  nextDeadlineLabel?: string | null;
}

// DASH-2: the only chip a calm card ever shows is none at all. The header
// chip is reserved for watch/red tier (filled, alarm-capable) or an excused
// state (quiet outline, no icon) - see the spec's "at most one chip" rule.
function ExcusedChip({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border bg-transparent px-2 py-0.5 text-xs font-medium shrink-0"
      style={{ color: 'hsl(var(--status-excused))', borderColor: 'hsl(var(--status-excused) / 0.3)' }}
    >
      {label}
    </span>
  );
}

export function LocationHealthCard({
  stats,
  excuseStatus,
  submissionGates,
  nextDeadlineLabel,
}: LocationHealthCardProps) {
  const navigate = useNavigate();

  const isFullyExcused = Boolean(excuseStatus?.isConfExcused && excuseStatus?.isPerfExcused);
  const isPartiallyExcused = Boolean(
    (excuseStatus?.isConfExcused || excuseStatus?.isPerfExcused) && !isFullyExcused,
  );
  const confExcused = excuseStatus?.isConfExcused ?? false;
  const perfExcused = excuseStatus?.isPerfExcused ?? false;

  const confClosed = submissionGates?.confidenceClosed ?? false;
  const perfClosed = submissionGates?.performanceClosed ?? false;
  const perfOpen = submissionGates?.performanceOpen ?? false;
  const anyDeadlinePassed = confClosed || perfClosed;

  // Round once and reuse everywhere (tier decision AND display) so a
  // displayed 60% can never be judged red and a displayed 85% can never
  // read as below the watch threshold (DASH-1a QA fix: rounding mismatch).
  const displayRate = Math.round(stats.submissionRate);

  // The single source of truth for card-level alarm color: red only past a
  // deadline and below the red threshold (with the small-team guard), amber
  // in the watch band, otherwise the default surface. See DASH-1a spec.
  // Uses distinctMissedCount (DASH-1a QA fix), not missingConfCount +
  // missingPerfCount, which double-counts anyone missing both metrics.
  const tier = participationTier({
    rate: displayRate,
    missedCount: stats.distinctMissedCount,
    teamSize: stats.staffCount,
    anyDeadlinePassed,
  });
  const tierTokens = tierColorTokens(tier);

  // Use a subtle wash (5% of the raw hue), not the opaque chip background,
  // so the card reads as a gentle tint rather than a filled badge.
  const cardWashStyle: React.CSSProperties = isFullyExcused || !tierTokens
    ? {}
    : {
        borderColor: tierTokens.border,
        backgroundColor: tier === 'red' ? 'hsl(var(--status-missing) / 0.05)' : 'hsl(var(--status-late) / 0.05)',
      };

  const rateColor = isFullyExcused
    ? 'hsl(var(--muted-foreground))'
    : tierTokens
      ? tierTokens.text
      : 'hsl(var(--foreground))';

  const confSub = stats.confSubmitted ?? 0;
  const confExp = stats.confExpected ?? 0;
  const perfSub = stats.perfSubmitted ?? 0;
  const perfExp = stats.perfExpected ?? 0;

  // One big number per state (spec rule 1): a raw progress fraction before
  // anything is due, otherwise a rate percent, never both stacked together.
  const renderBigNumber = () => {
    if (isFullyExcused) {
      const reason = excuseStatus?.confReason || excuseStatus?.perfReason;
      return (
        <>
          <div className="text-2xl font-black text-muted-foreground">Excused</div>
          {reason && <div className="text-2xs text-muted-foreground leading-tight">{reason}</div>}
        </>
      );
    }

    if (!anyDeadlinePassed) {
      return (
        <>
          <div className="text-xl font-black text-foreground">
            {confSub}/{confExp}
          </div>
          <div className="text-2xs text-muted-foreground leading-tight">checked in</div>
        </>
      );
    }

    return (
      <>
        <div className="text-2xl font-black" style={{ color: rateColor }}>
          {displayRate}%
        </div>
        <div className="text-2xs text-muted-foreground leading-tight">
          {confClosed && !perfClosed ? 'conf submitted' : 'submitted'}
        </div>
      </>
    );
  };

  // Fractions to the right of the big number, right-aligned and muted (spec
  // rule 5). A partially excused metric's slot reads "Conf excused" instead
  // of a fraction so the excuse isn't lost once its number stops appearing.
  const renderFractions = () => {
    if (isFullyExcused) return null;

    if (!anyDeadlinePassed) {
      if (perfOpen && confExp > 0 && !perfExcused) {
        return `Perf ${perfSub}/${perfExp}`;
      }
      return null;
    }

    const confPart = confExcused ? 'Conf excused' : `Conf ${confSub}/${confExp}`;
    const perfPart = perfExcused ? 'Perf excused' : `Perf ${perfSub}/${perfExp}`;
    return `${confPart} · ${perfPart}`;
  };

  const headerChip = (() => {
    if (isFullyExcused) return <ExcusedChip label="Excused" />;
    if (isPartiallyExcused) {
      const metric = confExcused ? 'Conf' : 'Perf';
      return <ExcusedChip label={`${metric} excused`} />;
    }
    // Tier and distinctMissedCount are independent props - guard against
    // upstream data landing a watch/red tier with a 0 count, which would
    // otherwise render a nonsensical "0 missed" chip. The card's
    // border/wash/number color still carry the tier on their own; only the
    // chip is suppressed. Mirrors the same guard in
    // locationStatusLine.ts's missingOrLatePhrases (DASH-2 QA fix 2).
    if ((tier === 'watch' || tier === 'red') && stats.distinctMissedCount > 0) {
      const tokens = tierColorTokens(tier)!;
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium shrink-0"
          style={{ backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }}
        >
          <AlertCircle className="h-4 w-4" />
          {stats.distinctMissedCount} missed
        </span>
      );
    }
    return null;
  })();

  const statusPhrases = buildLocationStatusLine({
    tier,
    isFullyExcused,
    isPartiallyExcused,
    confExcused,
    perfExcused,
    confReason: excuseStatus?.confReason ?? null,
    perfReason: excuseStatus?.perfReason ?? null,
    confClosed,
    perfClosed,
    perfOpen,
    missingConfCount: confExcused ? 0 : stats.missingConfCount,
    missingPerfCount: perfExcused ? 0 : stats.missingPerfCount,
    distinctMissedCount: stats.distinctMissedCount,
    nextDeadlineLabel: nextDeadlineLabel ?? null,
  });

  const fractions = renderFractions();

  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all border-2 relative",
        isFullyExcused && "border-muted bg-muted/20",
        !isFullyExcused && (tier === 'neutral' || tier === 'good') && "border-border bg-card",
      )}
      style={cardWashStyle}
      onClick={() => navigate(`/dashboard/location/${stats.id}`)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          {/* min-w-0 overrides the flex item's default min-width:auto, which
              would otherwise force this box to at least the title's
              min-content width and defeat truncate's ellipsis - see DASH-2
              QA fix 1. */}
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-bold truncate">{stats.name}</CardTitle>
          </div>
          {headerChip}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
          <Users className="h-4 w-4" />
          {stats.staffCount} active staff
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-end justify-between gap-2">
          <div>{renderBigNumber()}</div>
          {fractions && (
            <div className="text-2xs text-muted-foreground text-right shrink-0">{fractions}</div>
          )}
        </div>
        {statusPhrases.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-1 text-2xs text-muted-foreground mt-2">
            {statusPhrases.map((phrase, index) => (
              <span key={index} className="inline-flex items-center gap-1">
                {index > 0 && <span aria-hidden="true">&middot;</span>}
                {phrase.icon === 'check' && (
                  <CheckCircle2 className="h-4 w-4" style={{ color: 'hsl(var(--status-complete))' }} />
                )}
                {phrase.text}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
