import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Sparkles, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CompetencyAccordionProps {
  title: string;
  subtitle: string | null;
  description: string | null;
  score: number | null;
  proMoveCount: number;
  domainColor: string; // HSL raw string
}

function getScoreBadge(score: number | null) {
  if (score === null) {
    return {
      label: 'Exploration Mode',
      className: 'bg-muted text-muted-foreground border-muted-foreground/20'
    };
  }
  if (score >= 4) {
    return {
      label: 'Mastery',
      className: 'bg-amber-100 text-amber-800 border-amber-300'
    };
  }
  if (score >= 3) {
    return {
      label: 'Proficient',
      className: 'bg-blue-100 text-blue-800 border-blue-300'
    };
  }
  return {
    label: 'Building',
    className: 'bg-orange-100 text-orange-800 border-orange-300'
  };
}

export default function CompetencyAccordion({
  title,
  subtitle,
  description,
  score,
  proMoveCount,
  domainColor
}: CompetencyAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const badge = getScoreBadge(score);

  return (
    <div
      className={cn(
        'rounded-xl border-2 transition-all duration-200 cursor-pointer',
        'hover:scale-[1.01] hover:shadow-md',
        isOpen ? 'shadow-md' : 'shadow-sm'
      )}
      style={{
        backgroundColor: isOpen ? `hsl(${domainColor} / 0.05)` : 'hsl(var(--card))',
        borderColor: isOpen ? `hsl(${domainColor} / 0.4)` : 'hsl(var(--border))'
      }}
      onClick={() => setIsOpen(!isOpen)}
    >
      {/* Collapsed Header */}
      <div className="p-4 md:p-5 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground truncate">
            {subtitle || title}
          </p>
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {subtitle ? title : ''}
          </p>
        </div>

        <Badge variant="outline" className={cn('shrink-0', badge.className)}>
          {score !== null && (
            <Sparkles className="w-3 h-3 mr-1" />
          )}
          {badge.label}
        </Badge>

        <ChevronDown 
          className={cn(
            'w-5 h-5 text-muted-foreground transition-transform duration-200 shrink-0',
            isOpen && 'rotate-180'
          )} 
        />
      </div>

      {/* Expanded Content */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300',
          isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-4 md:px-5 pb-4 md:pb-5 pt-0 space-y-4">
          {description && (
            <p className="text-sm text-foreground/80 leading-relaxed">
              {description}
            </p>
          )}

          {proMoveCount > 0 && (
            <div 
              className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg"
              style={{ backgroundColor: `hsl(${domainColor} / 0.1)` }}
            >
              <BookOpen className="w-4 h-4" style={{ color: `hsl(${domainColor})` }} />
              <span style={{ color: `hsl(${domainColor})` }}>
                {proMoveCount} Pro Move{proMoveCount !== 1 ? 's' : ''} available
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
