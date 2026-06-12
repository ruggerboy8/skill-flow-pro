import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Sparkles, Loader2, Bookmark, MousePointerClick } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { adaptSequencerResponse, type RankedMove } from '@/lib/sequencerAdapter';
import { getDomainColor } from '@/lib/domainColors';
import { LibraryCard } from './LibraryCard';
import { fetchProMoveMetaByIds, fetchOrgProMoveMetaByIds } from '@/lib/proMoves';
import { formatWeekOf } from '@/lib/plannerUtils';

interface BrowseMove {
  action_id?: number;
  orgMoveId?: string;
  action_statement: string;
  domain_name: string;
  competency_name: string;
  isOrgCustom: boolean;
}

interface BenchMove {
  /** Platform moves use a numeric action_id; org custom moves use a UUID string */
  id: number | string;
  isOrgCustom: boolean;
  name: string;
  domainName: string;
}

/** Bench holds platform action_ids (number) and org custom move UUIDs (string) */
export type BenchId = number | string;

interface LibraryPanelProps {
  roleId: number;
  roleName: string;
  orgId?: string;
  practiceType?: string;
  selectedSlot: { weekStart: string; displayOrder: number } | null;
  onSelect: (actionId: number | null, orgMoveId?: string | null) => void;
  benchIds: BenchId[];
  onBenchToggle: (id: BenchId) => void;
  excludeActionIds?: number[];
}

function reasonLine(move: RankedMove): string {
  switch (move.primaryReasonCode) {
    case 'LOW_CONF':
      return move.lowConfShare != null
        ? `${Math.round(move.lowConfShare * 100)}% of the team rated themselves low`
        : 'Team confidence is low on this move';
    case 'RETEST':
      return move.lastPracticedWeeks < 999
        ? `Practiced ${move.lastPracticedWeeks} weeks ago — due for a check-in`
        : 'Due for a check-in';
    case 'STALE':
      return move.lastPracticedWeeks < 999
        ? `Not practiced in ${move.lastPracticedWeeks} weeks`
        : 'Getting stale — hasn\'t come up recently';
    case 'NEVER':
      return 'Never been practiced with this team';
    default:
      return 'Highly ranked for this team right now';
  }
}

function LensContent({
  moves,
  loading,
  benchIds,
  onBenchToggle,
  onSelect,
  hasActiveSlot,
  emptyMessage,
}: {
  moves: RankedMove[];
  loading: boolean;
  benchIds: BenchId[];
  onBenchToggle: (id: BenchId) => void;
  onSelect: (id: number) => void;
  hasActiveSlot: boolean;
  emptyMessage: string;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
      </div>
    );
  }
  if (moves.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-6">
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 p-4">
      {moves.map(move => (
        <LibraryCard
          key={move.proMoveId}
          actionId={move.proMoveId}
          name={move.name}
          domainName={move.domainName}
          reason={reasonLine(move)}
          isPinned={benchIds.includes(move.proMoveId)}
          onPin={() => onBenchToggle(move.proMoveId)}
          onSelect={() => onSelect(move.proMoveId)}
          hasActiveSlot={hasActiveSlot}
        />
      ))}
    </div>
  );
}

export function LibraryPanel({
  roleId,
  roleName,
  orgId,
  practiceType,
  selectedSlot,
  onSelect,
  benchIds,
  onBenchToggle,
  excludeActionIds = [],
}: LibraryPanelProps) {
  const { toast } = useToast();
  const [rankedMoves, setRankedMoves] = useState<RankedMove[]>([]);
  const [rankedLoading, setRankedLoading] = useState(true);
  const [browseMoves, setBrowseMoves] = useState<BrowseMove[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseSearch, setBrowseSearch] = useState('');
  const [benchMoves, setBenchMoves] = useState<BenchMove[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ interpretation: string; suggestions: any[] } | null>(null);

  useEffect(() => {
    loadRanked();
  }, [roleId, orgId, practiceType]);

  // Keep bench move metadata in sync with benchIds (mixed platform + org custom)
  useEffect(() => {
    if (benchIds.length === 0) { setBenchMoves([]); return; }
    const platformIds = benchIds.filter((id): id is number => typeof id === 'number');
    const orgIds = benchIds.filter((id): id is string => typeof id === 'string');
    Promise.all([
      fetchProMoveMetaByIds(platformIds),
      fetchOrgProMoveMetaByIds(orgIds),
    ]).then(([platformMeta, orgMeta]) => {
      setBenchMoves(benchIds.map(id => {
        if (typeof id === 'number') {
          const m = platformMeta.get(id);
          return { id, isOrgCustom: false, name: m?.statement ?? `Move ${id}`, domainName: m?.domain ?? '' };
        }
        const m = orgMeta.get(id);
        return { id, isOrgCustom: true, name: m?.statement ?? 'Custom move', domainName: m?.domain ?? '' };
      }));
    });
  }, [benchIds]);

  const loadRanked = async () => {
    setRankedLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sequencer-rank', {
        body: {
          roleId,
          orgId,
          preset: 'balanced',
          lookbackWeeks: 9,
          practiceType,
          constraints: { cooldownWeeks: 4, minDistinctDomains: 2 },
        },
      });
      if (error) throw error;
      setRankedMoves(adaptSequencerResponse(data));
    } catch (err: any) {
      toast({ title: 'Could not load recommendations', description: err.message, variant: 'destructive' });
    } finally {
      setRankedLoading(false);
    }
  };

  const loadBrowse = async () => {
    if (browseMoves.length > 0) return;
    setBrowseLoading(true);
    try {
      const [platformResult, orgResult] = await Promise.all([
        supabase
          .from('pro_moves')
          .select(`
            action_id, action_statement,
            competencies!fk_pro_moves_competency_id(
              name,
              domains!fk_competencies_domain_id(domain_name)
            )
          `)
          .eq('role_id', roleId)
          .eq('active', true)
          .order('action_id'),
        orgId
          ? supabase
              .from('organization_pro_moves')
              .select('id, action_statement, competency_id')
              .eq('org_id', orgId)
              .eq('role_id', roleId)
              .eq('active', true)
              .order('sort_order')
          : Promise.resolve({ data: null }),
      ]);

      const platformMoves: BrowseMove[] = (platformResult.data ?? []).map((m: any) => ({
        action_id: m.action_id,
        action_statement: m.action_statement,
        domain_name: m.competencies?.domains?.domain_name ?? '—',
        competency_name: m.competencies?.name ?? '—',
        isOrgCustom: false,
      }));

      let orgMoves: BrowseMove[] = [];
      if (orgResult.data && orgResult.data.length > 0) {
        const compIds = Array.from(new Set(orgResult.data.map((m: any) => m.competency_id).filter(Boolean)));
        const compMap = new Map<number, string>();
        if (compIds.length > 0) {
          const { data: comps } = await supabase
            .from('competencies')
            .select('competency_id, domains:fk_competencies_domain_id(domain_name)')
            .in('competency_id', compIds);
          (comps || []).forEach(c => {
            compMap.set(c.competency_id, (c.domains as any)?.domain_name || '');
          });
        }
        orgMoves = orgResult.data.map((m: any) => ({
          orgMoveId: m.id,
          action_statement: m.action_statement,
          domain_name: compMap.get(m.competency_id) || '—',
          competency_name: '—',
          isOrgCustom: true,
        }));
      }

      // Org custom moves appear first
      setBrowseMoves([...orgMoves, ...platformMoves]);
    } finally {
      setBrowseLoading(false);
    }
  };

  const handleAskAI = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('pro-move-suggest', {
        body: { description: aiInput.trim(), roleId, orgId, practiceType },
      });
      if (error) throw error;
      setAiResult(data);
    } catch (err: any) {
      toast({ title: 'AI suggestion failed', description: err.message, variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  const handleSelect = (actionId: number | null, orgMoveId?: string | null) => {
    if (!selectedSlot) {
      toast({ title: 'Select a slot first', description: 'Click a slot in the week builder, then pick a move.' });
      return;
    }
    onSelect(actionId, orgMoveId);
  };

  const hasActiveSlot = !!selectedSlot;

  // Lens buckets
  const struggling = rankedMoves.filter(m => m.primaryReasonCode === 'LOW_CONF' && !excludeActionIds.includes(m.proMoveId));
  const revisit    = rankedMoves.filter(m => m.primaryReasonCode === 'RETEST'   && !excludeActionIds.includes(m.proMoveId));
  const stale      = rankedMoves.filter(m => m.primaryReasonCode === 'STALE'    && !excludeActionIds.includes(m.proMoveId));
  const neverDone  = rankedMoves.filter(m => m.primaryReasonCode === 'NEVER'    && !excludeActionIds.includes(m.proMoveId));

  const filteredBrowse = browseMoves.filter(m =>
    !browseSearch ||
    m.action_statement.toLowerCase().includes(browseSearch.toLowerCase()) ||
    m.domain_name.toLowerCase().includes(browseSearch.toLowerCase()) ||
    (m.competency_name && m.competency_name.toLowerCase().includes(browseSearch.toLowerCase()))
  );

  const tabCount = (n: number) => n > 0 ? ` (${n})` : '';

  return (
    <div className="flex flex-col h-full border rounded-lg bg-card overflow-hidden">
      {/* Slot context header */}
      <div className={`flex-none px-4 py-3 border-b text-sm transition-colors ${
        hasActiveSlot
          ? 'bg-primary/5 border-primary/20'
          : 'bg-muted/20'
      }`}>
        {hasActiveSlot ? (
          <div className="flex items-center gap-2 text-primary">
            <MousePointerClick className="h-4 w-4 flex-none" />
            <span className="font-medium">
              Picking for slot #{selectedSlot!.displayOrder} — Week of {formatWeekOf(selectedSlot!.weekStart)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <MousePointerClick className="h-4 w-4 flex-none" />
            <span>Click a slot to pick a move, or drag a card to a slot</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="struggling" className="flex-1 flex flex-col min-h-0">
        <TabsList className="flex-none flex-wrap h-auto px-2 pt-2 pb-0 gap-0.5 bg-transparent border-b rounded-none justify-start">
          <TabsTrigger value="bench" className="text-xs h-8">
            <Bookmark className="h-3 w-3 mr-1" />
            Bench{tabCount(benchIds.length)}
          </TabsTrigger>
          <TabsTrigger value="struggling" className="text-xs h-8">
            Struggling{tabCount(struggling.length)}
          </TabsTrigger>
          <TabsTrigger value="revisit" className="text-xs h-8">
            Revisit{tabCount(revisit.length)}
          </TabsTrigger>
          <TabsTrigger value="stale" className="text-xs h-8">
            Stale{tabCount(stale.length)}
          </TabsTrigger>
          <TabsTrigger value="never" className="text-xs h-8">
            New{tabCount(neverDone.length)}
          </TabsTrigger>
          <TabsTrigger value="browse" className="text-xs h-8" onClick={loadBrowse}>
            Browse
          </TabsTrigger>
          <TabsTrigger value="ai" className="text-xs h-8">
            <Sparkles className="h-3 w-3 mr-1" />
            Ask AI
          </TabsTrigger>
        </TabsList>

        {/* Bench */}
        <TabsContent value="bench" className="flex-1 overflow-y-auto m-0 data-[state=inactive]:hidden">
          {benchMoves.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-6 gap-2">
              <Bookmark className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Pin moves from any tab to keep them handy here.</p>
            </div>
          ) : (
            <div className="space-y-2 p-4">
              {benchMoves.map(move => (
                <LibraryCard
                  key={move.id}
                  actionId={typeof move.id === 'number' ? move.id : undefined}
                  orgMoveId={typeof move.id === 'string' ? move.id : undefined}
                  name={move.name}
                  domainName={move.domainName}
                  isOrgCustom={move.isOrgCustom}
                  isPinned
                  onPin={() => onBenchToggle(move.id)}
                  onSelect={() => handleSelect(
                    typeof move.id === 'number' ? move.id : null,
                    typeof move.id === 'string' ? move.id : undefined,
                  )}
                  hasActiveSlot={hasActiveSlot}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Struggling */}
        <TabsContent value="struggling" className="flex-1 overflow-y-auto m-0 data-[state=inactive]:hidden">
          <LensContent
            moves={struggling}
            loading={rankedLoading}
            benchIds={benchIds}
            onBenchToggle={onBenchToggle}
            onSelect={handleSelect}
            hasActiveSlot={hasActiveSlot}
            emptyMessage="No moves with low confidence signals right now — the team is doing well."
          />
        </TabsContent>

        {/* Revisit */}
        <TabsContent value="revisit" className="flex-1 overflow-y-auto m-0 data-[state=inactive]:hidden">
          <LensContent
            moves={revisit}
            loading={rankedLoading}
            benchIds={benchIds}
            onBenchToggle={onBenchToggle}
            onSelect={handleSelect}
            hasActiveSlot={hasActiveSlot}
            emptyMessage="Nothing is due for a revisit right now."
          />
        </TabsContent>

        {/* Stale */}
        <TabsContent value="stale" className="flex-1 overflow-y-auto m-0 data-[state=inactive]:hidden">
          <LensContent
            moves={stale}
            loading={rankedLoading}
            benchIds={benchIds}
            onBenchToggle={onBenchToggle}
            onSelect={handleSelect}
            hasActiveSlot={hasActiveSlot}
            emptyMessage="Nothing has gone stale — your rotation looks healthy."
          />
        </TabsContent>

        {/* Never practiced */}
        <TabsContent value="never" className="flex-1 overflow-y-auto m-0 data-[state=inactive]:hidden">
          <LensContent
            moves={neverDone}
            loading={rankedLoading}
            benchIds={benchIds}
            onBenchToggle={onBenchToggle}
            onSelect={handleSelect}
            hasActiveSlot={hasActiveSlot}
            emptyMessage="All moves have been practiced at least once. Nice."
          />
        </TabsContent>

        {/* Browse */}
        <TabsContent value="browse" className="flex-1 flex flex-col min-h-0 m-0 data-[state=inactive]:hidden">
          <div className="p-4 pb-2 flex-none">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search moves, domains, competencies…"
                value={browseSearch}
                onChange={e => setBrowseSearch(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
            {browseLoading ? (
              [1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)
            ) : (
              filteredBrowse.map(m => {
                const benchId: BenchId | undefined = m.orgMoveId ?? m.action_id;
                return (
                  <LibraryCard
                    key={m.orgMoveId ? `org-${m.orgMoveId}` : `platform-${m.action_id}`}
                    actionId={m.action_id}
                    orgMoveId={m.orgMoveId}
                    name={m.action_statement}
                    domainName={m.domain_name}
                    isOrgCustom={m.isOrgCustom}
                    isPinned={benchId !== undefined && benchIds.includes(benchId)}
                    onPin={benchId !== undefined ? () => onBenchToggle(benchId) : undefined}
                    onSelect={() => handleSelect(m.action_id ?? null, m.orgMoveId)}
                    hasActiveSlot={hasActiveSlot}
                  />
                );
              })
            )}
            {!browseLoading && filteredBrowse.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No moves match your search.</p>
            )}
          </div>
        </TabsContent>

        {/* Ask AI */}
        <TabsContent value="ai" className="flex-1 overflow-y-auto m-0 data-[state=inactive]:hidden">
          <div className="p-4 space-y-3">
            <Textarea
              placeholder={`Describe a situation or goal for your ${roleName}s…\ne.g. "Patients aren't rescheduling at checkout" or "New staff struggling with treatment explanations"`}
              value={aiInput}
              onChange={e => { setAiInput(e.target.value); setAiResult(null); }}
              rows={3}
              className="text-sm resize-none"
            />
            <Button
              onClick={handleAskAI}
              disabled={!aiInput.trim() || aiLoading}
              className="w-full"
            >
              {aiLoading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Finding matches…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" />Get suggestions</>
              )}
            </Button>

            {aiLoading && (
              <div className="space-y-2 pt-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
              </div>
            )}

            {aiResult && !aiLoading && (
              <div className="space-y-3 pt-2">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">Read as: </span>{aiResult.interpretation}
                  </p>
                </div>
                {aiResult.suggestions.map((s: any) => {
                  const domainColor = getDomainColor(s.domain_name);
                  return (
                    <LibraryCard
                      key={s.action_id}
                      actionId={s.action_id}
                      name={s.action_statement}
                      domainName={s.domain_name}
                      reason={s.rationale}
                      isPinned={benchIds.includes(s.action_id)}
                      onPin={() => onBenchToggle(s.action_id)}
                      onSelect={() => handleSelect(s.action_id)}
                      hasActiveSlot={hasActiveSlot}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
