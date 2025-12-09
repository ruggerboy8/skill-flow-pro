import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ProMoveDetail } from '@/hooks/useDomainDetail';

interface ProMoveRowProps {
  move: ProMoveDetail;
  onClick?: () => void;
}

export function ProMoveRow({ move, onClick }: ProMoveRowProps) {
  const hasHistory = !!move.lastPracticed;

  return (
    <div 
      onClick={onClick}
      className="group flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-3 rounded-lg border border-transparent hover:bg-muted/50 hover:border-border/50 transition-all cursor-pointer"
    >
      {/* Content */}
      <div className="flex-1 space-y-1.5">
        <p className="text-sm font-medium leading-relaxed text-foreground/90">
          {move.action_statement}
        </p>
        
        {/* Mobile-friendly metadata layout */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {hasHistory ? (
            <>
              <div className="flex items-center text-muted-foreground">
                <Clock className="w-3 h-3 mr-1" />
                Last: {move.lastPracticed}
              </div>
              {move.avgConfidence !== null && (
                <div className="flex items-center text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Avg Conf: <span className="font-medium text-foreground ml-1">{move.avgConfidence.toFixed(1)}</span>
                </div>
              )}
            </>
          ) : (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal bg-primary/10 text-primary hover:bg-primary/20">
              Ready to try?
            </Badge>
          )}
        </div>
      </div>

      {/* Visual Indicator (hints at future clickability) */}
      <div className="hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity self-center">
        <ArrowRight className="w-4 h-4 text-muted-foreground/50" />
      </div>
    </div>
  );
}
