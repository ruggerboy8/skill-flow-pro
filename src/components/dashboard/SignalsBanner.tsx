import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, TrendingDown, Brain, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Signal {
  type: 'participation_drop' | 'domain_gap' | 'cross_location_gap' | 'eval_cadence';
  message: string;
  locationName?: string;
}

interface SignalsBannerProps {
  signals: Signal[];
}

const SIGNAL_ICON = {
  participation_drop: TrendingDown,
  domain_gap: Brain,
  cross_location_gap: Brain,
  eval_cadence: Calendar,
};

export function SignalsBanner({ signals }: SignalsBannerProps) {
  const [expanded, setExpanded] = useState(true);

  if (signals.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>No flags this week — all locations on track.</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
      <button
        className="flex items-center justify-between w-full px-4 py-3 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {signals.length} signal{signals.length !== 1 ? 's' : ''} this week
          </span>
          <Badge variant="secondary" className="bg-amber-200/60 text-amber-800 dark:bg-amber-800/40 dark:text-amber-300 text-xs">
            Needs attention
          </Badge>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-amber-200 dark:border-amber-800 px-4 py-3 space-y-2">
          {signals.map((signal, idx) => {
            const Icon = SIGNAL_ICON[signal.type];
            return (
              <div key={idx} className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200">
                <Icon className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>{signal.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
