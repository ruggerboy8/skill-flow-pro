import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, AlertCircle, CheckCircle2, CloudOff, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { participationTier, tierColorTokens } from "@/lib/participationTier";

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

// DASH-1a: a card carries at most one alarm (its own border/wash). Badges
// inside never go past --status-late (amber) - see src/lib/participationTier.ts.
function chipStyle(token: { bg: string; text: string; border: string }) {
  return {
    backgroundColor: token.bg,
    color: token.text,
    borderColor: token.border,
  };
}

const LATE_CHIP = { bg: 'hsl(var(--status-late-bg))', text: 'hsl(var(--status-late))', border: 'hsl(var(--status-late) / 0.3)' };
const PENDING_CHIP = { bg: 'hsl(var(--status-pending-bg))', text: 'hsl(var(--status-pending))', border: 'hsl(var(--status-pending) / 0.3)' };
const COMPLETE_CHIP = { bg: 'hsl(var(--status-complete-bg))', text: 'hsl(var(--status-complete))', border: 'hsl(var(--status-complete) / 0.3)' };

export function LocationHealthCard({
  stats,
  excuseStatus,
  submissionGates,
  nextDeadlineLabel,
}: LocationHealthCardProps) {
  const navigate = useNavigate();

  const isFullyExcused = excuseStatus?.isConfExcused && excuseStatus?.isPerfExcused;
  const isPartiallyExcused = (excuseStatus?.isConfExcused || excuseStatus?.isPerfExcused) && !isFullyExcused;

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

  // Render the big number based on deadline state
  const renderBigNumber = () => {
    if (isFullyExcused) {
      return (
        <>
          <div className="text-2xl font-black text-muted-foreground">—</div>
          <div className="text-2xs text-muted-foreground leading-tight">Location Excused</div>
        </>
      );
    }

    const confSub = stats.confSubmitted ?? 0;
    const confExp = stats.confExpected ?? 0;
    const perfSub = stats.perfSubmitted ?? 0;
    const perfExp = stats.perfExpected ?? 0;

    // After both deadlines: combined rate
    if (confClosed && perfClosed) {
      return (
        <>
          <div className="text-2xl font-black" style={{ color: rateColor }}>
            {displayRate}%
          </div>
          <div className="text-2xs text-muted-foreground leading-tight">Submitted</div>
        </>
      );
    }

    // After conf deadline, perf not yet due
    if (confClosed && !perfClosed) {
      return (
        <>
          <div className="text-2xl font-black" style={{ color: rateColor }}>
            {displayRate}%
          </div>
          <div className="text-2xs text-muted-foreground leading-tight">Conf Rate</div>
          {perfOpen && confExp > 0 && (
            <div className="text-2xs text-muted-foreground mt-0.5">
              {perfSub}/{perfExp} perf
            </div>
          )}
        </>
      );
    }

    // Before any deadline: show raw progress counts
    return (
      <>
        <div className="text-xl font-black text-foreground">
          {confSub}/{confExp}
        </div>
        <div className="text-2xs text-muted-foreground leading-tight">Conf</div>
        {perfOpen && confExp > 0 && (
          <div className="text-2xs text-muted-foreground mt-0.5">
            {perfSub}/{perfExp} perf
          </div>
        )}
      </>
    );
  };

  // Determine which excuse badge to show
  const getContextualExcuseBadge = () => {
    if (isFullyExcused) {
      const reason = excuseStatus?.confReason || excuseStatus?.perfReason;
      return (
        <Badge variant="secondary" className="bg-muted text-muted-foreground gap-1 shrink-0">
          <CloudOff className="h-4 w-4" />
          {reason ? `Excused: ${reason}` : 'Excused'}
        </Badge>
      );
    }

    if (isPartiallyExcused) {
      if (excuseStatus?.isConfExcused && submissionGates && !submissionGates.confidenceClosed) {
        return (
          <Badge variant="outline" className="border-warning text-warning gap-1 shrink-0">
            Conf Excused{excuseStatus.confReason ? `: ${excuseStatus.confReason}` : ''}
          </Badge>
        );
      }
      if (excuseStatus?.isPerfExcused && submissionGates?.performanceOpen) {
        return (
          <Badge variant="outline" className="border-warning text-warning gap-1 shrink-0">
            Perf Excused{excuseStatus.perfReason ? `: ${excuseStatus.perfReason}` : ''}
          </Badge>
        );
      }
      return (
        <Badge variant="outline" className="border-warning text-warning gap-1 shrink-0">
          {excuseStatus?.isConfExcused ? 'Conf' : 'Perf'} Excused
        </Badge>
      );
    }

    return null;
  };

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
        <div className="flex justify-between items-start">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg font-bold truncate">{stats.name}</CardTitle>
              {getContextualExcuseBadge()}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
              <Users className="h-3 w-3" />
              {stats.staffCount} Active Staff
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xs text-primary font-medium mb-0.5 uppercase tracking-wide">
              This Week
            </div>
            {renderBigNumber()}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mt-2">
          {isFullyExcused ? (
            <Badge variant="secondary" className="bg-muted/50 text-muted-foreground gap-1">
              <CheckCircle2 className="h-4 w-4" />
              No submissions required
            </Badge>
          ) : (
            <>
              {stats.missingConfCount > 0 && !excuseStatus?.isConfExcused && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={chipStyle(LATE_CHIP)}
                >
                  <AlertCircle className="h-4 w-4" />
                  {stats.missingConfCount} Late Conf
                </span>
              )}
              {(stats.pendingConfCount ?? 0) > 0 && !excuseStatus?.isConfExcused && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={chipStyle(PENDING_CHIP)}
                >
                  <Clock className="h-4 w-4" />
                  {stats.pendingConfCount} Awaiting Conf
                </span>
              )}
              {stats.missingPerfCount > 0 && !excuseStatus?.isPerfExcused && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={chipStyle(LATE_CHIP)}
                >
                  <AlertCircle className="h-4 w-4" />
                  {stats.missingPerfCount} Late Perf
                </span>
              )}
              {perfOpen && !perfClosed && stats.missingPerfCount === 0 && !excuseStatus?.isPerfExcused && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={chipStyle(PENDING_CHIP)}
                >
                  <Clock className="h-4 w-4" />
                  Perf Window Open
                </span>
              )}
              {excuseStatus?.isConfExcused && (
                <Badge variant="secondary" className="bg-muted/50 text-muted-foreground gap-1">
                  Conf Excused
                </Badge>
              )}
              {excuseStatus?.isPerfExcused && (
                <Badge variant="secondary" className="bg-muted/50 text-muted-foreground gap-1">
                  Perf Excused
                </Badge>
              )}
              {/* Before any deadline: show next deadline context */}
              {!anyDeadlinePassed && stats.missingConfCount === 0 && (stats.pendingConfCount ?? 0) === 0 &&
               !excuseStatus?.isConfExcused && !excuseStatus?.isPerfExcused && nextDeadlineLabel && (
                <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground gap-1">
                  <Clock className="h-4 w-4" />
                  {nextDeadlineLabel}
                </Badge>
              )}
              {/* After deadline(s), all good - quiet, not a celebration */}
              {anyDeadlinePassed && stats.missingConfCount === 0 && (stats.pendingConfCount ?? 0) === 0 &&
               stats.missingPerfCount === 0 && !excuseStatus?.isConfExcused && !excuseStatus?.isPerfExcused && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
                  style={chipStyle(COMPLETE_CHIP)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  On Track
                </span>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
