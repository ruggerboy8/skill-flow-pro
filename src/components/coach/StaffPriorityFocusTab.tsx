import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { getDomainColor, getDomainColorRaw } from '@/lib/domainColors';
import { format, parseISO, subWeeks } from 'date-fns';

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

  function getConfidenceBadgeStyle(score: number) {
    if (score === 1) return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-amber-100 text-amber-800 border-amber-200';
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Priority Focus Areas</CardTitle>
            <p className="text-xs text-muted-foreground">
              Pro moves self-rated as low confidence ({lookbackLabel})
            </p>
          </div>
          <ToggleGroup 
            type="single" 
            value={lookback} 
            onValueChange={(v) => v && setLookback(v as LookbackOption)}
            size="sm"
            className="gap-0"
          >
            <ToggleGroupItem value="3" className="text-xs px-2 h-7 rounded-r-none">
              3 wks
            </ToggleGroupItem>
            <ToggleGroupItem value="6" className="text-xs px-2 h-7 rounded-none border-x-0">
              6 wks
            </ToggleGroupItem>
            <ToggleGroupItem value="all" className="text-xs px-2 h-7 rounded-l-none">
              All
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        {lowConfidenceScores.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No low confidence ratings in the {lookbackLabel}
          </p>
        ) : (
          <div className="space-y-2">
            {lowConfidenceScores.map((score, idx) => {
              const domainColorRaw = getDomainColorRaw(score.domain_name);
              const domainColor = getDomainColor(score.domain_name);
              return (
                <div
                  key={`${score.action_id}-${score.week_of}-${idx}`}
                  className="p-3 border rounded-lg space-y-2"
                  style={{
                    backgroundColor: `hsl(${domainColorRaw} / 0.15)`,
                    borderColor: `hsl(${domainColorRaw} / 0.3)`,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-tight flex-1">
                      {score.action_statement}
                    </p>
                    <Badge 
                      variant="outline" 
                      className={`shrink-0 ${getConfidenceBadgeStyle(score.confidence_score!)}`}
                    >
                      {score.confidence_score} / 4
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <Badge
                      className="text-xs text-white"
                      style={{ backgroundColor: domainColor }}
                    >
                      {score.domain_name}
                    </Badge>
                    <span>Week of {format(parseISO(score.week_of), 'MMM d, yyyy')}</span>
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
