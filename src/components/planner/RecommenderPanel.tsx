import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Play, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getDomainColor } from '@/lib/domainColors';

interface RecommenderPanelProps {
  roleId: number;
  roleName: string;
}

interface ProMoveRecommendation {
  proMoveId: number;
  name: string;
  domainName: string;
  domainId: number;
  parts: { C: number; R: number; E: number; D: number; T?: number };
  finalScore: number;
  weeksSinceSeen: number;
  confidenceN: number;
  status: string;
  reasonSummary?: string;
  lastSeen?: string;
  reason_tags?: string[];
}

export function RecommenderPanel({ roleId, roleName }: RecommenderPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [allRanked, setAllRanked] = useState<ProMoveRecommendation[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedMove, setExpandedMove] = useState<number | null>(null);
  const [preset, setPreset] = useState<string>('balanced');
  
  const ITEMS_PER_PAGE = 6;

  // Auto-load recommendations on mount
  useEffect(() => {
    loadRecommendations();
  }, [roleId, preset]);

  const loadRecommendations = async () => {
    setLoading(true);
    setCurrentPage(0);
    setExpandedMove(null);
    try {
      const { data, error } = await supabase.functions.invoke('sequencer-rank', {
        body: {
          roleId,
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

      const allMoves = data.ranked || [];
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
  
  const startIdx = currentPage * ITEMS_PER_PAGE;
  const visibleMoves = allRanked.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  const totalPages = Math.ceil(allRanked.length / ITEMS_PER_PAGE);
  const hasPrevPage = currentPage > 0;
  const hasNextPage = currentPage < totalPages - 1;

  return (
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
            <Play className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Run
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="preset" className="text-xs">Preset</Label>
          <Select value={preset} onValueChange={setPreset}>
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

        {/* Arrow Pagination */}
        {allRanked.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between pt-2 px-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={!hasPrevPage}
              className="gap-1"
            >
              ← Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              {startIdx + 1}–{Math.min(startIdx + ITEMS_PER_PAGE, allRanked.length)} of {allRanked.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={!hasNextPage}
              className="gap-1"
            >
              Next →
            </Button>
          </div>
        )}

        {/* Pro-Move Cards */}
        <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto pr-2">
          {visibleMoves.map((move) => {
            const needScore = Math.round(move.finalScore * 100);
            const colorClass = needScore >= 75 ? 'text-red-600' : 
                              needScore >= 50 ? 'text-orange-500' :
                              needScore >= 25 ? 'text-yellow-600' : 'text-green-600';

            return (
              <div
                key={move.proMoveId}
                draggable={true}
                onDragStart={(e) => {
                  const payload = JSON.stringify({
                    actionId: move.proMoveId,
                    actionStatement: move.name,
                    domainName: move.domainName,
                    competencyTag: '',
                    rankSnapshot: {
                      parts: {
                        C: move.parts.C,
                        R: move.parts.R,
                        E: move.parts.E,
                        D: move.parts.D,
                        T: move.parts.T || 0,
                      },
                      final: move.finalScore,
                      reason_tags: move.reason_tags || (() => {
                        const tags: string[] = [];
                        if (move.parts.C >= 0.60) tags.push('low_conf_trigger');
                        if ((move.parts.T || 0) > 0) tags.push('retest_window');
                        if (move.weeksSinceSeen === 999) tags.push('never_practiced');
                        if (move.parts.R >= 0.8) tags.push('long_unseen');
                        return tags;
                      })(),
                      version: 'v4.0',
                    },
                  });
                  e.dataTransfer.effectAllowed = 'copy';
                  e.dataTransfer.setData('application/json', payload);
                  e.dataTransfer.setData('text/plain', payload);
                }}
                className="p-3 border rounded-lg space-y-2 cursor-move hover:shadow-md hover:border-primary transition-all"
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
                    variant="secondary" 
                    className="text-xs"
                    style={{
                      backgroundColor: `hsl(${getDomainColor(move.domainName)})`,
                    }}
                  >
                    {move.domainName}
                  </Badge>

                  {move.weeksSinceSeen === 999 && (
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

                {/* Details Toggle */}
                <Collapsible open={expandedMove === move.proMoveId} onOpenChange={() => {
                  setExpandedMove(expandedMove === move.proMoveId ? null : move.proMoveId);
                }}>
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs mt-1 h-6"
                    >
                      {expandedMove === move.proMoveId ? (
                        <><ChevronUp className="h-3 w-3 mr-1" /> Hide Details</>
                      ) : (
                        <><ChevronDown className="h-3 w-3 mr-1" /> Show Details</>
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                      <div className="p-2 bg-muted rounded text-xs space-y-1">
                      <div className="font-semibold">Score Breakdown:</div>
                      <div className="grid grid-cols-2 gap-1">
                        <div>Confidence: {Math.round(move.parts.C * 100)}</div>
                        <div>Recency: {Math.round(move.parts.R * 100)}</div>
                        <div>Eval: {Math.round(move.parts.E * 100)}</div>
                        <div>Diversity: {Math.round(move.parts.D * 100)}</div>
                        {(move.parts.T || 0) > 0 && (
                          <div className="col-span-2">Retest Boost: {Math.round((move.parts.T || 0) * 100)}</div>
                        )}
                      </div>
                      {move.reasonSummary && (
                        <>
                          <div className="font-semibold mt-2">Why recommended:</div>
                          <div className="text-muted-foreground">{move.reasonSummary}</div>
                        </>
                      )}
                      {move.lastSeen && (
                        <div className="mt-2 text-muted-foreground">
                          Last assigned: {move.lastSeen}
                        </div>
                      )}
                      {move.weeksSinceSeen < 999 && (
                        <div className="text-muted-foreground">
                          {move.weeksSinceSeen} weeks ago
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
