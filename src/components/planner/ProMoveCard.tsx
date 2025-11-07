import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfidenceBar } from './ConfidenceBar';
import { formatPrimaryReason, formatLastPracticed, getBadges } from '@/lib/recommenderUtils';

interface ProMoveCardProps {
  move: {
    proMoveId: number;
    name: string;
    domainName: string;
    domainColorHsl: string;
    finalScore: number;
    lowConfShare: number | null;
    avgConfLast: number | null;
    lastPracticedWeeks: number;
    retestDue: boolean;
    primaryReasonCode: 'LOW_CONF' | 'RETEST' | 'NEVER' | 'STALE' | 'TIE';
    primaryReasonValue: number | null;
  };
}

export function ProMoveCard({ move }: ProMoveCardProps) {
  const badges = getBadges(move);
  const primaryReason = formatPrimaryReason(move.primaryReasonCode, move.primaryReasonValue);
  
  const needScore = move.finalScore;
  const colorClass = needScore >= 75 ? 'text-destructive' : 
                    needScore >= 50 ? 'text-orange-500' :
                    needScore >= 25 ? 'text-yellow-600' : 'text-green-600';

  return (
    <div
      draggable={true}
      onDragStart={(e) => {
        const payload = JSON.stringify({
          actionId: move.proMoveId,
          title: move.name,
          domainName: move.domainName,
        });
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/json', payload);
        e.dataTransfer.setData('text/plain', payload);
      }}
      className="p-4 border rounded-lg space-y-3 cursor-move hover:shadow-md hover:border-primary transition-all bg-card"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight line-clamp-2 mb-2">
            {move.name}
          </p>
          <Badge 
            variant="secondary" 
            className="text-xs"
            style={{
              backgroundColor: `hsl(${move.domainColorHsl})`,
              color: 'white',
            }}
          >
            {move.domainName}
          </Badge>
        </div>
        <span className={`text-2xl font-bold ${colorClass} shrink-0`}>
          {needScore}
        </span>
      </div>

      {/* Primary Reason */}
      {primaryReason && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-primary pl-2">
          {primaryReason}
        </p>
      )}

      {/* Labels */}
      <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t">
        <div>
          <span className="text-muted-foreground">% at 1–2:</span>
          <span className="ml-1 font-medium">
            {move.lowConfShare !== null ? `${Math.round(move.lowConfShare * 100)}%` : '—'}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Avg conf:</span>
          <div className="mt-1">
            <ConfidenceBar value={move.avgConfLast} />
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Last practiced:</span>
          <span className="ml-1 font-medium">
            {formatLastPracticed(move.lastPracticedWeeks)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Retest due:</span>
          <span className="ml-1 font-medium">
            {move.retestDue ? 'Yes' : 'No'}
          </span>
        </div>
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="flex gap-1 pt-2">
          <TooltipProvider>
            {badges.map((badge, idx) => (
              <Tooltip key={idx} delayDuration={0}>
                <TooltipTrigger asChild>
                  <Badge variant={badge.variant} className="text-xs cursor-help">
                    {badge.label}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">{badge.tooltip}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}
