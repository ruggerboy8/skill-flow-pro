import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatPrimaryReason, formatLastPracticed, getBadges } from '@/lib/recommenderUtils';

interface ProMoveRowProps {
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

export function ProMoveRow({ move }: ProMoveRowProps) {
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
      className="p-3 border-b hover:bg-muted/50 cursor-move transition-colors flex items-center gap-3"
    >
      {/* Score */}
      <span className={`text-lg font-bold ${colorClass} shrink-0 w-12 text-right`}>
        {needScore}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium leading-tight truncate flex-1">
            {move.name}
          </p>
          <Badge 
            variant="secondary" 
            className="text-xs shrink-0"
            style={{
              backgroundColor: `hsl(${move.domainColorHsl})`,
              color: 'white',
            }}
          >
            {move.domainName}
          </Badge>
        </div>
        
        {primaryReason && (
          <p className="text-xs text-muted-foreground italic truncate">
            {primaryReason}
          </p>
        )}
      </div>

      {/* Quick Stats */}
      <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
        <span>
          {move.lowConfShare !== null ? `${Math.round(move.lowConfShare * 100)}%` : '—'}
        </span>
        <span>
          {formatLastPracticed(move.lastPracticedWeeks)}
        </span>
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="flex gap-1 shrink-0">
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
