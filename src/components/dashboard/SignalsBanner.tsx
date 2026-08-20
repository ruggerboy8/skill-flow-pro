import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, TrendingDown, Brain, Calendar } from 'lucide-react';

export type SignalSeverity = 'watch' | 'red';

export interface Signal {
  type: 'participation_drop' | 'domain_gap' | 'cross_location_gap' | 'eval_cadence';
  message: string;
  locationName?: string;
  /**
   * 'red' only for genuinely missed locations (past deadline, below the red
   * threshold). Everything else, including pre-deadline pending states,
   * is 'watch' (amber) at most. Defaults to 'watch' when omitted.
   */
  severity?: SignalSeverity;
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

const TONE_TOKENS = {
  red: {
    text: 'hsl(var(--status-missing))',
    bg: 'hsl(var(--status-missing-bg))',
    border: 'hsl(var(--status-missing) / 0.3)',
  },
  watch: {
    text: 'hsl(var(--status-late))',
    bg: 'hsl(var(--status-late-bg))',
    border: 'hsl(var(--status-late) / 0.3)',
  },
} as const;

export function SignalsBanner({ signals }: SignalsBannerProps) {
  const [expanded, setExpanded] = useState(true);

  if (signals.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
        <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'hsl(var(--status-complete))' }} />
        <span>No flags this week, all locations on track.</span>
      </div>
    );
  }

  // The banner's overall tone follows the worst signal in it, so it never
  // disagrees with the individual entries (or the location cards).
  const tone = signals.some(s => s.severity === 'red') ? TONE_TOKENS.red : TONE_TOKENS.watch;

  return (
    <div className="rounded-lg border" style={{ borderColor: tone.border, backgroundColor: tone.bg }}>
      <button
        className="flex items-center justify-between w-full px-4 py-3 text-left"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: tone.text }} />
          <span className="text-sm font-semibold" style={{ color: tone.text }}>
            {signals.length} signal{signals.length !== 1 ? 's' : ''} this week
          </span>
          <Badge variant="secondary" className="text-xs" style={{ backgroundColor: tone.bg, color: tone.text }}>
            Needs attention
          </Badge>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4" style={{ color: tone.text }} />
        ) : (
          <ChevronDown className="h-4 w-4" style={{ color: tone.text }} />
        )}
      </button>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-2" style={{ borderColor: tone.border }}>
          {signals.map((signal, idx) => {
            const Icon = SIGNAL_ICON[signal.type];
            const itemTone = signal.severity === 'red' ? TONE_TOKENS.red : TONE_TOKENS.watch;
            return (
              <div key={idx} className="flex items-start gap-2 text-sm" style={{ color: itemTone.text }}>
                <Icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: itemTone.text }} />
                <span>{signal.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
