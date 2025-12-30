import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { getDomainColorRich, getDomainColorRichRaw } from '@/lib/domainColors';
import { format, parseISO, subWeeks } from 'date-fns';
import { cn } from '@/lib/utils';

interface ScoreRow {
  week_of: string;
  action_id: number;
  action_statement: string;
  domain_name: string;
  confidence_score: number | null;
}

interface StaffPriorityFocusTabProps {
  rawData: ScoreRow[];
}

type LookbackOption = '3' | '6' | 'all';

export function StaffPriorityFocusTab({ rawData }: StaffPriorityFocusTabProps) {
  const [lookback, setLookback] = useState<LookbackOption>('6');

  const lowConfidenceScores = useMemo(() => {
    const now = new Date();
    const cutoff = lookback === 'all' 
      ? new Date(0) // Beginning of time
      : subWeeks(now, parseInt(lookback));

    return rawData
      .filter((score) => {
        // Only confidence scores of 1 or 2
        if (score.confidence_score === null || score.confidence_score > 2) {
          return false;
        }
        // Filter by lookback period
        const weekDate = parseISO(score.week_of);
        return weekDate >= cutoff && weekDate <= now;
      })
      .sort((a, b) => {
        // Sort by week descending (most recent first), then by confidence ascending
        const weekCompare = new Date(b.week_of).getTime() - new Date(a.week_of).getTime();
        if (weekCompare !== 0) return weekCompare;
        return (a.confidence_score ?? 0) - (b.confidence_score ?? 0);
      });
  }, [rawData, lookback]);

  const lookbackLabel = lookback === 'all' ? 'all time' : `past ${lookback} weeks`;

  return (
    <Card className="border-0 md:border rounded-none md:rounded-xl shadow-none md:shadow-sm bg-transparent md:bg-card">
      <CardHeader className="pb-3 px-0 md:px-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Priority Focus Areas</CardTitle>
            <p className="text-xs text-muted-foreground">
              Low confidence items from {lookbackLabel}
            </p>
          </div>
          <ToggleGroup 
            type="single" 
            value={lookback} 
            onValueChange={(v) => v && setLookback(v as LookbackOption)}
            size="sm"
            className="bg-muted/50 p-1 rounded-lg"
          >
            <ToggleGroupItem value="3" className="text-xs px-2 h-6 rounded-md">3 wks</ToggleGroupItem>
            <ToggleGroupItem value="6" className="text-xs px-2 h-6 rounded-md">6 wks</ToggleGroupItem>
            <ToggleGroupItem value="all" className="text-xs px-2 h-6 rounded-md">All</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent className="px-0 md:px-6">
        {lowConfidenceScores.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No low confidence ratings found.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {lowConfidenceScores.map((score, idx) => {
              const domainColorRich = getDomainColorRich(score.domain_name);
              const richRaw = getDomainColorRichRaw(score.domain_name);
              
              return (
                <div
                  key={`${score.action_id}-${score.week_of}-${idx}`}
                  className="flex overflow-hidden rounded-xl border border-border/50 bg-white dark:bg-slate-800 shadow-sm"
                >
                  {/* Full Spine - Vertical Text */}
                  <div 
                    className="relative flex-shrink-0 w-8 flex items-center justify-center"
                    style={{ backgroundColor: `hsl(${richRaw} / 0.15)` }}
                  >
                    <span 
                      className="text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                      style={{ 
                        writingMode: 'vertical-rl',
                        transform: 'rotate(180deg)',
                        color: domainColorRich
                      }}
                    >
                      {score.domain_name}
                    </span>
                  </div>
                  
                  {/* Content Area */}
                  <div className="flex-1 p-3 min-w-0">
                    <p className="text-sm font-medium leading-snug text-foreground">
                      {score.action_statement}
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-2 text-xs text-muted-foreground">
                      <span>Week of {format(parseISO(score.week_of), 'MMM d')}</span>
                      <span className={cn(
                        "font-semibold px-2 py-0.5 rounded-full",
                        score.confidence_score === 1 
                          ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" 
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      )}>
                        Confidence: {score.confidence_score}/4
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
