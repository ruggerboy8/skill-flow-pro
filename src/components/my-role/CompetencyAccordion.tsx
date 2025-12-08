import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ProMoveRow } from './ProMoveRow';
import type { ProMoveDetail } from '@/hooks/useDomainDetail';

interface CompetencyAccordionProps {
  title: string;
  subtitle: string | null;
  description: string | null;
  score: number | null;
  proMoves: ProMoveDetail[];
  domainColor: string;
}

function getScoreBadge(score: number | null) {
  if (score === null) {
    return {
      label: 'Exploration Mode',
      className: 'bg-muted text-muted-foreground border-muted-foreground/20'
    };
  }
  if (score === 4) {
    return {
      label: 'Mastery',
      className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
    };
  }
  if (score === 3) {
    return {
      label: 'Proficient',
      className: 'bg-blue-500/10 text-blue-600 border-blue-500/30'
    };
  }
  // score 1-2
  return {
    label: 'Building',
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/30'
  };
}

export default function CompetencyAccordion({
  title,
  subtitle,
  description,
  score,
  proMoves,
  domainColor
}: CompetencyAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const badge = getScoreBadge(score);

  return (
    <div
      className={cn(
        'rounded-xl border transition-all duration-300 overflow-hidden',
        isOpen
          ? 'bg-card shadow-md border-border'
          : 'bg-card/50 hover:bg-card/80 border-transparent hover:border-border/50 cursor-pointer'
      )}
      onClick={() => !isOpen && setIsOpen(true)}
    >
      {/* Collapsed Header */}
      <div className="p-4 md:p-5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground truncate">
            {title}
          </p>
          {subtitle && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">
              {subtitle}
            </p>
          )}
        </div>

        <Badge variant="outline" className={cn('shrink-0', badge.className)}>
          {badge.label}
        </Badge>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className={cn(
            'p-1.5 rounded-full transition-all duration-300 shrink-0',
            'hover:bg-muted/80',
            isOpen && 'rotate-180'
          )}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Expanded Content */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300',
          isOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div
          className="px-4 md:px-5 pb-5 pt-2 border-t"
          style={{ borderColor: `hsl(${domainColor} / 0.2)` }}
        >
          {/* Description */}
          {description && (
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {description}
            </p>
          )}

          {/* Skills Menu */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Skills in this area
            </h4>
            <div className="grid gap-1">
              {proMoves.map(move => (
                <ProMoveRow key={move.action_id} move={move} />
              ))}
            </div>
            {proMoves.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                No specific skills defined
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
