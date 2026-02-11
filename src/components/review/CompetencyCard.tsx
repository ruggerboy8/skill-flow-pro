import { useState } from 'react';
import { DomainBadge } from '@/components/ui/domain-badge';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ReviewPayloadItem } from '@/lib/reviewPayload';
import { cn } from '@/lib/utils';

interface CompetencyCardProps {
  item: ReviewPayloadItem;
  selected?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  /** Hide the selection affordance entirely (read-only display) */
  readOnly?: boolean;
}

export function CompetencyCard({ item, selected, onSelect, disabled, readOnly }: CompetencyCardProps) {
  const [noteOpen, setNoteOpen] = useState(false);
  const hasCoachNote = !!item.observer_note?.trim();
  const hasSelfNote = !!item.self_note?.trim();

  return (
    <div
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : 0}
      onClick={readOnly || disabled ? undefined : onSelect}
      onKeyDown={readOnly || disabled ? undefined : (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(); }
      }}
      className={cn(
        'rounded-lg border p-4 transition-colors',
        readOnly ? 'cursor-default' : 'cursor-pointer',
        selected ? 'border-primary bg-primary/5' : 'border-border',
        !readOnly && !disabled && !selected && 'hover:border-muted-foreground/40',
        disabled && 'opacity-50 cursor-not-allowed',
      )}
    >
      {/* Header row: domain badge + name */}
      <div className="flex items-start gap-2">
        <DomainBadge domain={item.domain_name} className="mt-0.5" />
        <div className="flex-1">
          <span className="text-sm font-medium leading-snug">{item.competency_name}</span>
          {item.tagline && (
            <p className="text-xs italic text-muted-foreground mt-0.5">{item.tagline}</p>
          )}
        </div>
      </div>

      {/* Scores row */}
      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
        <span>Coach: <strong className="text-foreground">{item.observer_score}</strong></span>
        {item.self_score != null && (
          <span>Self: <strong className="text-foreground">{item.self_score}</strong></span>
        )}
        {item.gap != null && (
          <span className="text-muted-foreground">Gap: {item.gap > 0 ? '+' : ''}{item.gap}</span>
        )}
      </div>

      {/* Coach note toggle */}
      {hasCoachNote && (
        <div className="mt-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setNoteOpen(o => !o); }}
            className="text-sm font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
          >
            View Coach Notes
            {noteOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {noteOpen && (
            <p className="text-xs text-muted-foreground mt-1 pl-1 border-l-2 border-muted leading-relaxed">
              {item.observer_note}
            </p>
          )}
        </div>
      )}

      {/* Self note */}
      {hasSelfNote && noteOpen && (
        <div className="mt-2">
          <span className="text-xs text-muted-foreground font-medium">Your note</span>
          <p className="text-xs text-muted-foreground mt-0.5 pl-1 border-l-2 border-muted leading-relaxed">
            {item.self_note}
          </p>
        </div>
      )}
    </div>
  );
}
