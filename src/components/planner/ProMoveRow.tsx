import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatPrimaryReason, formatLastPracticed, getBadges } from '@/lib/recommenderUtils';
import type { RankedMove } from '@/lib/sequencerAdapter';

interface ProMoveRowProps {
  move: RankedMove;
}

export function ProMoveRow({ move }: ProMoveRowProps) {
  const badges = getBadges(move);
  const primaryReason = formatPrimaryReason(move);

  return (
    <div
      draggable={true}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/json', JSON.stringify({ actionId: move.proMoveId }));
      }}
      className="p-3 border-b hover:bg-muted/50 cursor-move transition-colors flex items-center gap-3"
    >
      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium leading-tight truncate flex-1">
            {move.name}
          </p>
          <span 
            className="px-1.5 py-0.5 text-[10px] rounded text-foreground ring-1 ring-border/50 shrink-0"
            style={{ backgroundColor: `hsl(${move.domainColorHsl})` }}
          >
            {move.domainName}
          </span>
        </div>
        
        <p className="text-xs text-muted-foreground italic truncate">
          {primaryReason}
        </p>
      </div>

      {/* Quick Stats */}
      <div className="flex gap-3 text-xs text-muted-foreground shrink-0">
        <span title="Low 1-2%">
          {move.lowConfShare !== null ? `${Math.round(move.lowConfShare * 100)}%` : '—'}
        </span>
        <span title="Last practiced">
          {formatLastPracticed(move.lastPracticedWeeks)}
        </span>
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <TooltipProvider delayDuration={0}>
          <div className="flex gap-1 shrink-0">
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
