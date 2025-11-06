import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CalendarIcon, Play, Copy, ChevronDown, Zap, Clock, Target } from 'lucide-react';
import { formatWeekOf, isMondayChicago, getChicagoMonday } from '@/lib/plannerUtils';
import { cn } from '@/lib/utils';
import { PlannerPreset } from '@/hooks/usePlannerParams';

interface RecommenderPanelProps {
  roleId: number;
  roleName: string;
  asOfWeek: string;
  preset: PlannerPreset;
  onWeekChange: (week: string) => void;
  onPresetChange: (preset: PlannerPreset) => void;
}

interface ProMoveRecommendation {
  proMoveId: number;
  name: string;
  domain: string;
  competencyTag: string;
  score: number;
  breakdown: { C: number; R: number; E: number; D: number };
  lastSeenWeeksAgo: number | null;
  cooldownOk: boolean;
  cooldownReason: string | null;
  reasonSummary: string;
}

interface RecommenderResponse {
  roleId: number;
  asOfWeek: string;
  preset: string;
  weights: { C: number; R: number; E: number; D: number };
  rankVersion: string;
  poolSize: number;
  rulesApplied: string[];
  relaxedConstraintNote: string | null;
  top6: ProMoveRecommendation[];
}

const presetLabels: Record<PlannerPreset, string> = {
  balanced: 'Balanced',
  confidence_recovery: 'Confidence Recovery',
  eval_focus: 'Evaluation Focus',
  variety_first: 'Variety First',
};

export function RecommenderPanel({
  roleId,
  roleName,
  asOfWeek,
  preset,
  onWeekChange,
  onPresetChange,
}: RecommenderPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<RecommenderResponse | null>(null);

  const handleRunRecommender = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sequencer-rank', {
        body: {
          roleId,
          asOfWeek,
          lookbackWeeks: 9,
          preset,
          constraints: {
            minDistinctDomains: 2,
            cooldownWeeks: 4,
            excludeMoveIds: [],
          },
        },
      });

      if (error) throw error;

      setResults(data);
      toast({
        title: 'Recommender Complete',
        description: `Ranked ${data.top6?.length || 0} pro-moves from pool of ${data.poolSize || 0}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopyJson = () => {
    if (results) {
      navigator.clipboard.writeText(JSON.stringify(results, null, 2));
      toast({ title: 'Copied to clipboard' });
    }
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      const dateStr = getChicagoMonday(date);
      onWeekChange(dateStr);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Pro-Move Recommender - {roleName}
            </CardTitle>
            <CardDescription>
              Analyze and rank pro-moves by priority for a specific week
            </CardDescription>
          </div>
          {results && (
            <Button variant="outline" size="sm" onClick={handleCopyJson}>
              <Copy className="h-4 w-4 mr-2" />
              Copy JSON
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Week of (Monday)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formatWeekOf(asOfWeek)}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={new Date(asOfWeek + 'T12:00:00')}
                  onSelect={handleDateSelect}
                  disabled={(date) => {
                    const monday = getChicagoMonday(date);
                    return !isMondayChicago(monday);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-2">
            <Label>Preset</Label>
            <Select value={preset} onValueChange={(v) => onPresetChange(v as PlannerPreset)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(presetLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={handleRunRecommender} disabled={loading} className="w-full" size="lg">
          <Play className="mr-2 h-4 w-4" />
          Run Recommender
        </Button>

        {/* Results */}
        {results && (
          <div className="space-y-4">
            {/* Meta info */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Badge variant="outline">v{results.rankVersion}</Badge>
              <span>Pool: {results.poolSize}</span>
              <span>Rules: {results.rulesApplied.join(', ')}</span>
            </div>

            {results.relaxedConstraintNote && (
              <div className="p-3 border border-yellow-500/50 bg-yellow-500/10 rounded-lg text-sm">
                <strong>Note:</strong> {results.relaxedConstraintNote}
              </div>
            )}

            {/* Top 6 cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.top6.map((move, idx) => (
                <Card key={move.proMoveId} className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="secondary" className="text-xs">
                        #{idx + 1}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {move.domain}
                      </Badge>
                    </div>
                    <CardTitle className="text-sm leading-tight">{move.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Score</span>
                      <span className="text-lg font-bold">{move.score.toFixed(3)}</span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {move.lastSeenWeeksAgo !== null
                        ? `${move.lastSeenWeeksAgo} weeks ago`
                        : 'Never practiced'}
                    </div>

                    {!move.cooldownOk && (
                      <Badge variant="destructive" className="text-xs">
                        Cooldown: {move.cooldownReason}
                      </Badge>
                    )}

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      <Target className="h-3 w-3 inline mr-1" />
                      {move.reasonSummary}
                    </p>

                    <Collapsible>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full">
                          <ChevronDown className="h-4 w-4 mr-2" />
                          Details
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2 space-y-1">
                        <div className="text-xs space-y-1">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">C (Confidence):</span>
                            <span className="font-mono">{move.breakdown.C.toFixed(3)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">R (Recency):</span>
                            <span className="font-mono">{move.breakdown.R.toFixed(3)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">E (Eval):</span>
                            <span className="font-mono">{move.breakdown.E.toFixed(3)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">D (Diversity):</span>
                            <span className="font-mono">{move.breakdown.D.toFixed(3)}</span>
                          </div>
                          <div className="pt-2 text-muted-foreground">
                            Tag: {move.competencyTag}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </CardContent>
                </Card>
              ))}
            </div>

            {results.top6.length === 0 && (
              <div className="text-center p-8 text-muted-foreground">
                No recommendations available under current constraints.
                Try adjusting the preset or date.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
