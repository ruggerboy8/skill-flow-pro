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
  onSelectMove?: (move: ProMoveDetail) => void;
}

// DSN-4: mastery tier is a competency SCORE, not a submission/delivery
// STATUS — CLAUDE.md documents these as separate token families
// (--score-1..4 vs --status-*), so this reads from the score tokens
// directly rather than being forced through StatusBadge.
function getScoreBadge(score: number | null): { label: string; style: React.CSSProperties } {
  if (score === null) {
    // Badge's outline variant (used below) renders NO fill and
    // text-foreground, not the muted-gray pill this is meant to be —
    // pin it explicitly so it doesn't inherit the wrong look.
    return {
      label: 'Exploration',
      style: {
        backgroundColor: 'hsl(var(--muted))',
        color: 'hsl(var(--muted-foreground))',
        borderColor: 'hsl(var(--muted-foreground) / 0.2)',
      },
    };
  }
  if (score === 4) {
    return {
      label: 'Mastery',
      style: { backgroundColor: 'hsl(var(--score-4-bg))', color: 'hsl(var(--score-4))', borderColor: 'hsl(var(--score-4) / 0.3)' },
    };
  }
  if (score === 3) {
    return {
      label: 'Proficient',
      style: { backgroundColor: 'hsl(var(--score-3-bg))', color: 'hsl(var(--score-3))', borderColor: 'hsl(var(--score-3) / 0.3)' },
    };
  }
  return {
    label: 'Building',
    style: { backgroundColor: 'hsl(var(--score-2-bg))', color: 'hsl(var(--score-2))', borderColor: 'hsl(var(--score-2) / 0.3)' },
  };
}

export default function CompetencyAccordion({
  title,
  subtitle,
  description,
  score,
  proMoves,
  domainColor,
  onSelectMove
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
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 md:p-5 min-h-[44px] cursor-pointer w-full text-left active:bg-muted/40 transition-colors">
          {/* Text Group - Expands */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground leading-tight text-base">
              {title}
            </p>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1 italic">
                {subtitle}
              </p>
            )}
          </div>

          {/* Meta Group - Badge + Chevron stay together */}
          <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
            <Badge variant="outline" className="shrink-0 h-6" style={badge.style}>
              {score !== null && <Sparkles className="w-4 h-4 mr-1" />}
              {badge.label}
            </Badge>

            <ChevronDown
              className={cn(
                'w-5 h-5 text-muted-foreground transition-transform duration-200 shrink-0',
                isOpen && 'rotate-180'
              )}
            />
          </div>
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
                  <ProMoveRow 
                    key={move.action_id} 
                    move={move} 
                    onClick={() => onSelectMove?.(move)}
                  />
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
