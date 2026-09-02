import { ChevronRight, MessageSquare } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export interface BaselineItem {
  action_id: number;
  action_statement: string;
  competency_name: string;
  self_note?: string | null;
}

interface RatingBandCollapsibleProps {
  score: number;
  items: BaselineItem[];
  defaultOpen?: boolean;
  onItemClick: (item: BaselineItem) => void;
}

// 1-4 self-rating bands use the --score-N learning-gradient tokens (DASH-1a:
// confidence/skill scores never render as a red/green traffic light).
// textClass uses the -ink variant, not the vivid --score-N: the vivid color
// on top of -bg fails normal-text contrast in light mode (~1.8-2.9:1).
// -ink is the mode-aware shade tuned for exactly this on-tint-text pairing
// (same pattern as ConfidenceCard, TeamStaffPage, ClinicalBaselineResults).
// borderClass keeps the vivid token — fine for borders/accents.
const BAND_CONFIG: Record<number, {
  label: string;
  subtext: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
}> = {
  4: {
    label: '4 — Exceptional, above and beyond',
    subtext: 'If this is a 4, you\'re saying you go beyond the standard—others look to you as the example.',
    bgClass: 'bg-[hsl(var(--score-4-bg))]',
    borderClass: 'border-[hsl(var(--score-4))]/30',
    textClass: 'text-[hsl(var(--score-4-ink))]',
  },
  3: {
    label: '3 — Excellent, consistent standard',
    subtext: 'If this is a 3, you\'re saying you do this reliably and well—it\'s part of who you are.',
    bgClass: 'bg-[hsl(var(--score-3-bg))]',
    borderClass: 'border-[hsl(var(--score-3))]/30',
    textClass: 'text-[hsl(var(--score-3-ink))]',
  },
  2: {
    label: '2 — Good, with room to grow',
    subtext: 'If this is a 2, you\'re saying there\'s opportunity here—you\'re working on it.',
    bgClass: 'bg-[hsl(var(--score-2-bg))]',
    borderClass: 'border-[hsl(var(--score-2))]/30',
    textClass: 'text-[hsl(var(--score-2-ink))]',
  },
  1: {
    label: '1 — Needs focus',
    subtext: 'If this is a 1, you\'re saying this isn\'t reliably showing up yet.',
    bgClass: 'bg-[hsl(var(--score-1-bg))]',
    borderClass: 'border-[hsl(var(--score-1))]/30',
    textClass: 'text-[hsl(var(--score-1-ink))]',
  },
};

export function RatingBandCollapsible({
  score,
  items,
  defaultOpen = false,
  onItemClick,
}: RatingBandCollapsibleProps) {
  const config = BAND_CONFIG[score];
  
  if (!config || items.length === 0) return null;

  return (
    <Collapsible defaultOpen={defaultOpen} className="w-full">
      <CollapsibleTrigger className={`w-full p-4 rounded-lg border ${config.bgClass} ${config.borderClass} text-left group`}>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className={`font-semibold ${config.textClass}`}>
              {config.label}
              <span className="ml-2 text-sm font-normal opacity-75">
                ({items.length} {items.length === 1 ? 'move' : 'moves'})
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {config.subtext}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-2">
        <div className="space-y-1 pl-2">
          {items.map((item) => (
            <button
              key={item.action_id}
              onClick={() => onItemClick(item)}
              className="w-full flex items-center justify-between p-3 rounded-md hover:bg-muted/50 transition-colors text-left group"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-sm">{item.action_statement}</span>
                {item.self_note?.trim() && (
                  <MessageSquare className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </button>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
