import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw } from 'lucide-react';
import { normalizeToPlannerWeek } from '@/lib/plannerUtils';

interface RecommenderPanelProps {
  roleId: number;
  roleName: string;
  asOfWeek: string;
  preset: string;
  onWeekChange: (week: string) => void;
  onPresetChange: (preset: string) => void;
  usedActionIds?: number[];
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

export function RecommenderPanel({
  roleId,
  roleName,
  asOfWeek,
  preset,
  onWeekChange,
  onPresetChange,
  usedActionIds = [],
}: RecommenderPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [allRanked, setAllRanked] = useState<ProMoveRecommendation[]>([]);

  const loadRecommendations = async () => {
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

      const allMoves = data.allRanked || data.top6 || [];
      setAllRanked(allMoves);
      
      toast({
        title: 'Recommendations loaded',
        description: `${allMoves.length} pro-moves ranked`,
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

  return (
    <div className="sticky top-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Pro-Move Recommender</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={loadRecommendations}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="asOfWeek" className="text-xs">As of Week</Label>
              <Input
                id="asOfWeek"
                type="date"
                value={asOfWeek}
                onChange={(e) => onWeekChange(normalizeToPlannerWeek(e.target.value))}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="preset" className="text-xs">Preset</Label>
              <Select value={preset} onValueChange={onPresetChange}>
                <SelectTrigger id="preset" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="confidence_recovery">Confidence Focus</SelectItem>
                  <SelectItem value="eval_focus">Eval Focus</SelectItem>
                  <SelectItem value="variety_first">Variety First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="grid grid-cols-2 gap-3 pr-4">
              {allRanked.map((move) => {
                const isUsed = usedActionIds.includes(move.proMoveId);
                const needScore = Math.round(move.score * 100);
                const colorClass = needScore >= 75 ? 'text-red-600' : 
                                  needScore >= 50 ? 'text-orange-500' :
                                  needScore >= 25 ? 'text-yellow-600' : 'text-green-600';

                return (
                  <div
                    key={move.proMoveId}
                    draggable={!isUsed}
                    onDragStart={(e) => {
                      if (isUsed) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.effectAllowed = 'copy';
                      e.dataTransfer.setData('application/json', JSON.stringify({
                        actionId: move.proMoveId,
                        actionStatement: move.name,
                        domainName: move.domain,
                        competencyTag: move.competencyTag,
                      }));
                    }}
                    className={`p-3 border rounded-lg space-y-2 transition-all ${
                      isUsed 
                        ? 'opacity-40 cursor-not-allowed bg-muted' 
                        : 'cursor-move hover:shadow-md hover:border-primary'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight line-clamp-2">
                          {move.name}
                        </p>
                      </div>
                      <span className={`text-lg font-bold ${colorClass} shrink-0`}>
                        {needScore}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      <Badge 
                        variant="outline" 
                        className="text-xs"
                        style={{
                          borderColor: `hsl(var(--domain-${move.domain.toLowerCase().replace(/\s+/g, '-')}))`,
                          color: `hsl(var(--domain-${move.domain.toLowerCase().replace(/\s+/g, '-')}))`
                        }}
                      >
                        {move.domain}
                      </Badge>

                      {move.lastSeenWeeksAgo === null && (
                        <Badge variant="secondary" className="text-xs">
                          🆕 Never
                        </Badge>
                      )}

                      {move.reasonSummary?.includes('low avg confidence') && (
                        <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">
                          ⚡ Low Conf
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
