import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatPrimaryReason, formatLastPracticed, getBadges } from '@/lib/recommenderUtils';
import type { RankedMove } from '@/lib/sequencerAdapter';
import { getDomainColor } from '@/lib/domainColors';

interface ProMoveCardProps {
  move: RankedMove;
  highPriority?: boolean;
}

export function ProMoveCard({ move, highPriority }: ProMoveCardProps) {
  const badges = getBadges(move);
  const primaryReason = formatPrimaryReason(move);
  const domainHsl = getDomainColor(move.domainName);
  
  const needScore = move.finalScore;
  const colorClass = needScore >= 75 ? 'text-destructive' : 
                    needScore >= 50 ? 'text-orange-500' :
                    needScore >= 25 ? 'text-yellow-600' : 'text-green-600';

  return (
    <div
      draggable={true}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/json', JSON.stringify({ actionId: move.proMoveId }));
      }}
      className="p-4 border rounded-lg hover:bg-muted/50 cursor-move transition-colors space-y-3"
    >
      {/* Header with score badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm leading-tight mb-1">{move.name}</h4>
          <div className="flex items-center gap-2 flex-wrap">
            <span 
              className="px-1.5 py-0.5 text-[10px] rounded text-foreground ring-1 ring-border/50"
              style={{ backgroundColor: domainHsl }}
            >
              {move.domainName}
            </span>
            {highPriority && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-primary/10 text-primary ring-1 ring-primary/30">
                      High priority
                    </span>
                  </TooltipTrigger>
                  <TooltipContent><span className="text-xs">Top 6 this run</span></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
        <span 
          className={`text-2xl font-bold shrink-0 ${colorClass}`}
        >
          {needScore}
        </span>
      </div>

      {/* Primary reason */}
      <p className="text-xs text-muted-foreground italic">{primaryReason}</p>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Avg conf:</span>
          <div className="font-medium">
            {move.avgConfLast !== null ? move.avgConfLast.toFixed(1) : '—'}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Last:</span>
          <div className="font-medium">{formatLastPracticed(move.lastPracticedWeeks)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Retest:</span>
          <div className="font-medium">{move.retestDue ? 'Yes' : 'No'}</div>
        </div>
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <TooltipProvider delayDuration={0}>
          <div className="flex gap-1">
            {badges.map((b, i) => (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-foreground cursor-help">
                    {b.label}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <span className="text-xs">{b.tooltip}</span>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
