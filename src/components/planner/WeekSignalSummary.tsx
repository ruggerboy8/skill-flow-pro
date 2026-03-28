import { RankedMove } from '@/lib/sequencerAdapter';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingDown, Clock, Star } from 'lucide-react';

interface WeekSignalSummaryProps {
  rankedMoves: RankedMove[];
  loading: boolean;
  roleName: string;
}

function formatReasonLabel(move: RankedMove): string {
  switch (move.primaryReasonCode) {
    case 'LOW_CONF':
      return `avg ${move.avgConfLast?.toFixed(1) ?? '—'}/4 confidence${move.lowConfShare != null ? ` — ${Math.round(move.lowConfShare * 100)}% of team struggling` : ''}`;
    case 'NEVER':
      return 'never been practiced by this team';
    case 'STALE':
      return `not practiced in ${move.lastPracticedWeeks} weeks`;
    default:
      return 'high overall ranking';
  }
}

export function WeekSignalSummary({ rankedMoves, loading, roleName }: WeekSignalSummaryProps) {
  if (!loading && rankedMoves.length === 0) return null;

  if (loading) {
    return (
      <Card className="mb-4">
        <CardContent className="py-3 px-4 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  const topNeed = rankedMoves.find(m => m.primaryReasonCode === 'LOW_CONF') ?? rankedMoves[0];
  const mostOverdue = rankedMoves.find(m => m.primaryReasonCode === 'NEVER' || m.primaryReasonCode === 'STALE');
  const highPriority = [...rankedMoves].sort((a, b) => (b.curriculumPriority ?? 0) - (a.curriculumPriority ?? 0)).find(m => (m.curriculumPriority ?? 0) > 0);

  const signals = [
    topNeed && {
      icon: <TrendingDown className="h-3.5 w-3.5 text-red-500 flex-none mt-0.5" />,
      label: 'Biggest need',
      text: `"${topNeed.name}" — ${formatReasonLabel(topNeed)}`,
    },
    mostOverdue && mostOverdue.proMoveId !== topNeed?.proMoveId && {
      icon: <Clock className="h-3.5 w-3.5 text-amber-500 flex-none mt-0.5" />,
      label: 'Most overdue',
      text: `"${mostOverdue.name}" — ${formatReasonLabel(mostOverdue)}`,
    },
    highPriority && {
      icon: <Star className="h-3.5 w-3.5 text-blue-500 flex-none mt-0.5" />,
      label: 'High importance',
      text: `"${highPriority.name}" — priority ${Math.round((highPriority.curriculumPriority ?? 0) * 10)}/10`,
    },
  ].filter(Boolean);

  if (signals.length === 0) return null;

  return (
    <Card className="mb-4 border-muted bg-muted/30">
      <CardContent className="py-3 px-4">
        <p className="text-xs font-medium text-muted-foreground mb-2">Team signals — {roleName}</p>
        <div className="space-y-1.5">
          {signals.map((signal, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              {signal!.icon}
              <span>
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide mr-1.5">{signal!.label}</span>
                <span className="text-foreground">{signal!.text}</span>
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
