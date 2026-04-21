import { Card, CardContent } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export interface ParticipationSnapshot {
  window_start: string;
  window_end: string;
  weeks_in_window: number;
  confidence_completed: number;
  performance_completed: number;
  on_time_count: number;
  total_self_score_submissions: number;
  competencies_with_data: number;
}

interface Props {
  snapshot: ParticipationSnapshot | null | undefined;
  evalType?: string | null;
}

function pct(n: number, d: number): number {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function bar(filled: number, total: number, width = 12): string {
  if (total <= 0) return '○'.repeat(width);
  const f = Math.max(0, Math.min(width, Math.round((filled / total) * width)));
  return '●'.repeat(f) + '○'.repeat(width - f);
}

/**
 * Read-only snapshot of the staff member's submission participation over the
 * 12-week window leading up to the evaluation. Frozen at submit time.
 *
 * Hidden for Baseline evals (no participation history yet).
 */
export function ParticipationSnapshotCard({ snapshot, evalType }: Props) {
  if (evalType === 'Baseline') return null;
  if (!snapshot) return null;

  const totalSubmissions =
    snapshot.confidence_completed + snapshot.performance_completed;
  const totalExpected = snapshot.weeks_in_window * 2;
  const onTimeRate = pct(snapshot.on_time_count, totalSubmissions);
  const confRate = pct(snapshot.confidence_completed, snapshot.weeks_in_window);
  const perfRate = pct(snapshot.performance_completed, snapshot.weeks_in_window);

  const hasData = totalSubmissions > 0;
  const windowEnd = format(parseISO(snapshot.window_end), 'MMM d, yyyy');

  return (
    <Card className="border-border/60">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              ProMove Participation
            </h3>
            <p className="text-xs text-muted-foreground">
              Last {snapshot.weeks_in_window} weeks ending {windowEnd}
            </p>
          </div>
        </div>

        {!hasData ? (
          <p className="text-sm text-muted-foreground italic">
            Not enough participation history yet.
          </p>
        ) : (
          <div className="space-y-2 font-mono text-xs sm:text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-foreground">Confidence check-ins</span>
              <span className="text-muted-foreground tabular-nums">
                {snapshot.confidence_completed} / {snapshot.weeks_in_window}{' '}
                <span className="ml-1">{confRate}%</span>{' '}
                <span className="ml-2 text-foreground/70">
                  {bar(snapshot.confidence_completed, snapshot.weeks_in_window)}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-foreground">Performance submissions</span>
              <span className="text-muted-foreground tabular-nums">
                {snapshot.performance_completed} / {snapshot.weeks_in_window}{' '}
                <span className="ml-1">{perfRate}%</span>{' '}
                <span className="ml-2 text-foreground/70">
                  {bar(snapshot.performance_completed, snapshot.weeks_in_window)}
                </span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-foreground">On-time rate</span>
              <span className="text-muted-foreground tabular-nums">{onTimeRate}%</span>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground pt-2 border-t border-border/40">
          Self-scores below were aggregated from{' '}
          <span className="font-medium text-foreground">
            {snapshot.total_self_score_submissions}
          </span>{' '}
          weekly performance submissions across{' '}
          <span className="font-medium text-foreground">
            {snapshot.competencies_with_data}
          </span>{' '}
          {snapshot.competencies_with_data === 1 ? 'competency' : 'competencies'}.
        </p>
      </CardContent>
    </Card>
  );
}
