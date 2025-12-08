import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProMoveDetail } from '@/hooks/useDomainDetail';
import { ProMoveRow } from './ProMoveRow';

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
    return { label: 'Exploration', className: 'bg-muted text-muted-foreground border-muted-foreground/20' };
  }
  if (score === 4) {
    return { label: 'Mastery', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' };
  }
  if (score === 3) {
    return { label: 'Proficient', className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' };
  }
  return { label: 'Building', className: 'bg-amber-500/10 text-amber-600 border-amber-500/30' };
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
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        'rounded-xl border-2 transition-all duration-200 bg-card',
        'hover:shadow-md',
        isOpen ? 'shadow-md' : 'shadow-sm'
      )}
      style={{
        borderColor: isOpen ? `hsl(${domainColor} / 0.4)` : 'transparent'
      }}
    >
      <CollapsibleTrigger asChild>
        <div className="flex items-center gap-4 p-4 md:p-5 cursor-pointer w-full text-left">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground leading-tight truncate">
              {title}
            </p>
            {subtitle && (
              <p className="text-xs md:text-sm text-muted-foreground mt-1 truncate">
                {subtitle}
              </p>
            )}
          </div>

          <Badge variant="outline" className={cn('shrink-0 h-6', badge.className)}>
            {score !== null && <Sparkles className="w-3 h-3 mr-1" />}
            {badge.label}
          </Badge>

          <ChevronDown
            className={cn(
              'w-5 h-5 text-muted-foreground transition-transform duration-200 shrink-0',
              isOpen && 'rotate-180'
            )}
          />
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-4 md:px-5 pb-5 pt-0">
          {/* Description Section */}
          {description && (
            <div className="pb-5 mb-5 border-b border-border/50">
              <p className="text-sm text-muted-foreground leading-relaxed">
                {description}
              </p>
            </div>
          )}

          {/* Action Menu Section */}
          {proMoves.length > 0 ? (
            <div className="space-y-3">
              <h4 
                className="text-xs font-semibold uppercase tracking-wider mb-2 flex items-center gap-2"
                style={{ color: `hsl(${domainColor})` }}
              >
                Skills in this area
              </h4>
              <div className="grid gap-1">
                {proMoves.map((move) => (
                  <ProMoveRow key={move.action_id} move={move} />
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No specific skills defined yet.</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
