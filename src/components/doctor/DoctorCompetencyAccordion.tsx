import { useState } from 'react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ChevronDown, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DoctorProMoveDetail } from '@/hooks/useDoctorDomainDetail';

interface DoctorCompetencyAccordionProps {
  title: string;
  subtitle: string | null;
  description: string | null;
  proMoves: DoctorProMoveDetail[];
  domainColor: string;
  onSelectMove?: (move: DoctorProMoveDetail) => void;
}

export function DoctorCompetencyAccordion({
  title,
  subtitle,
  description,
  proMoves,
  domainColor,
  onSelectMove
}: DoctorCompetencyAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

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
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 md:p-5 cursor-pointer w-full text-left">
          {/* Text Group */}
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

          {/* Chevron */}
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

          {/* Pro Moves List */}
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
                  <div 
                    key={move.action_id}
                    onClick={() => onSelectMove?.(move)}
                    className="group flex items-start justify-between gap-3 p-3 rounded-lg border border-transparent hover:bg-muted/50 hover:border-border/50 transition-all cursor-pointer"
                  >
                    <p className="text-sm font-medium leading-relaxed text-foreground/90">
                      {move.action_statement}
                    </p>
                    <div className="hidden sm:block opacity-0 group-hover:opacity-100 transition-opacity self-center">
                      <ArrowRight className="w-4 h-4 text-muted-foreground/50" />
                    </div>
                  </div>
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
