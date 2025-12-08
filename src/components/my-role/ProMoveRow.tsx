import { Clock } from 'lucide-react';
import type { ProMoveDetail } from '@/hooks/useDomainDetail';

interface ProMoveRowProps {
  move: ProMoveDetail;
}

export function ProMoveRow({ move }: ProMoveRowProps) {
  const hasPracticed = move.lastPracticed !== null;

  return (
    <div className="p-3 rounded-lg border border-transparent hover:bg-muted/50 hover:border-muted/20 transition-all">
      <p className="text-sm font-medium leading-relaxed text-foreground/90">
        {move.action_statement}
      </p>
      
      <div className="mt-1.5">
        {hasPracticed ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>
              Last: {move.lastPracticed}
              {move.avgConfidence !== null && ` • Avg Conf: ${move.avgConfidence.toFixed(1)}`}
            </span>
          </div>
        ) : (
          <span className="text-xs font-medium text-primary/80">
            Ready to try this?
          </span>
        )}
      </div>
    </div>
  );
}
