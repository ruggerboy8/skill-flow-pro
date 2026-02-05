import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export interface BaselineItem {
  action_id: number;
  action_statement: string;
  competency_name: string;
}

interface RatingBandCollapsibleProps {
  score: number;
  items: BaselineItem[];
  defaultOpen?: boolean;
  onItemClick: (item: BaselineItem) => void;
}

const BAND_CONFIG: Record<number, {
  label: string;
  subtext: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
}> = {
  4: {
    label: '4 — Consistent, even when you\'re behind',
    subtext: 'If this is a 4, you\'re saying you could model it on demand and your team would see it most days.',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
    textClass: 'text-emerald-700 dark:text-emerald-300',
  },
  3: {
    label: '3 — Usually, with predictable misses',
    subtext: 'If this is a 3, you\'re saying it\'s part of your standard approach, but you can name when it slips.',
    bgClass: 'bg-blue-50 dark:bg-blue-950/30',
    borderClass: 'border-blue-200 dark:border-blue-800',
    textClass: 'text-blue-700 dark:text-blue-300',
  },
  2: {
    label: '2 — Sometimes, not yet reliable',
    subtext: 'If this is a 2, you\'re saying you do it occasionally, but it\'s not consistent across patients/days.',
    bgClass: 'bg-amber-50 dark:bg-amber-950/30',
    borderClass: 'border-amber-200 dark:border-amber-800',
    textClass: 'text-amber-700 dark:text-amber-300',
  },
  1: {
    label: '1 — Rare / not in your current routine',
    subtext: 'If this is a 1, you\'re saying it doesn\'t reliably show up today.',
    bgClass: 'bg-red-50 dark:bg-red-950/30',
    borderClass: 'border-red-200 dark:border-red-800',
    textClass: 'text-red-700 dark:text-red-300',
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
              <span className="text-sm">{item.action_statement}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
