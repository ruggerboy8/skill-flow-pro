import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Play } from 'lucide-react';
import { ProMoveCard } from './ProMoveCard';
import { RecommenderFilters } from './RecommenderFilters';
import { RecommenderGlossary } from './RecommenderGlossary';
import { applyFilters, type FilterState } from '@/lib/recommenderUtils';
import { adaptSequencerRow, type RankedMove } from '@/lib/sequencerAdapter';

interface RecommenderPanelProps {
  roleId: number;
  roleName: string;
}


const PAGE_SIZE = 12;

export function RecommenderPanel({ roleId, roleName }: RecommenderPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [rankedAll, setRankedAll] = useState<RankedMove[]>([]);
  const [top6Ids, setTop6Ids] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState<FilterState>({ signals: [], domains: [] });
  const [sort, setSort] = useState<'need' | 'lowConf' | 'weeks' | 'domain'>('need');
  const [page, setPage] = useState(0);
  const [preset, setPreset] = useState<string>('balanced');

  useEffect(() => {
    loadRecommendations();
  }, [roleId, preset]);

  const loadRecommendations = async () => {
    setLoading(true);
    setPage(0);
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

      const allMoves = (data.ranked || []).map(adaptSequencerRow);
      setRankedAll(allMoves);
      
      // Capture top 6 IDs before any filters/sorts
      const initialTop6 = (data.ranked || []).slice(0, 6).map((x: any) => x.proMoveId);
      setTop6Ids(new Set(initialTop6));
      
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

  const filteredMoves = applyFilters(rankedAll, filters, sort);
  const startIdx = page * PAGE_SIZE;
  const visibleMoves = filteredMoves.slice(startIdx, startIdx + PAGE_SIZE);
  const totalPages = Math.ceil(filteredMoves.length / PAGE_SIZE);
  const hasPrevPage = page > 0;
  const hasNextPage = page < totalPages - 1;

  const availableDomains = Array.from(new Set(rankedAll.map(m => m.domainName)));

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filters, sort]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-none">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <CardTitle>Pro-Move Recommender</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-[160px]">
              <Label htmlFor="preset" className="text-xs text-muted-foreground">Preset</Label>
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
            <Button
              variant="outline"
              size="sm"
              onClick={loadRecommendations}
              disabled={loading}
              className="gap-2 shrink-0"
            >
              <Play className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Run
            </Button>
          </div>
        </div>

        <div className="mt-3 space-y-3">
          <RecommenderFilters
            value={filters}
            onChange={setFilters}
            sort={sort}
            onSortChange={setSort}
            availableDomains={availableDomains}
          />
          
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1 gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={!hasPrevPage}
                className="gap-1 shrink-0"
              >
                ← Previous
              </Button>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, filteredMoves.length)} of {filteredMoves.length}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={!hasNextPage}
                className="gap-1 shrink-0"
              >
                Next →
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto space-y-3">
        {visibleMoves.length === 0 ? (
          <div className="text-sm text-muted-foreground">No results with current filters.</div>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
            {visibleMoves.map((move) => (
              <ProMoveCard
                key={move.proMoveId}
                move={move}
                highPriority={top6Ids.has(move.proMoveId)}
              />
            ))}
          </div>
        )}

        <RecommenderGlossary />
      </CardContent>
    </Card>
  );
}
