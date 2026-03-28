import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Loader2, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getDomainColor } from '@/lib/domainColors';
import type { RankedMove } from '@/lib/sequencerAdapter';

interface SmartSlotPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (actionId: number, actionStatement: string, source: 'ranked' | 'ai' | 'browse') => void;
  slot: { weekStart: string; displayOrder: 1 | 2 | 3 } | null;
  roleId: number;
  roleName: string;
  orgId: string;
  practiceType?: string;
  rankedMoves: RankedMove[];
  excludeActionIds?: number[];
}

function reasonLabel(move: RankedMove): string {
  switch (move.primaryReasonCode) {
    case 'LOW_CONF':
      return move.lowConfShare != null
        ? `Team confidence low — ${Math.round(move.lowConfShare * 100)}% struggling`
        : 'Team confidence low';
    case 'NEVER': return 'Never been practiced';
    case 'STALE': return `Not practiced in ${move.lastPracticedWeeks} weeks`;
    case 'RETEST': return 'Due for a check-in';
    default: return 'Highly ranked this cycle';
  }
}

interface BrowseMove {
  action_id: number;
  action_statement: string;
  domain_name: string;
  competency_name: string;
}

export function SmartSlotPicker({
  open, onClose, onSelect, slot, roleId, roleName, orgId, practiceType, rankedMoves, excludeActionIds = []
}: SmartSlotPickerProps) {
  const { toast } = useToast();
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ interpretation: string; suggestions: any[] } | null>(null);
  const [browseSearch, setBrowseSearch] = useState('');
  const [browseMoves, setBrowseMoves] = useState<BrowseMove[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  const filteredRanked = rankedMoves
    .filter(m => !excludeActionIds.includes(m.proMoveId))
    .slice(0, 8);

  // Load browse moves lazily when tab opens
  const loadBrowseMoves = async () => {
    if (browseMoves.length > 0) return;
    setBrowseLoading(true);
    try {
      const { data } = await supabase
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
        .order('action_id');
      setBrowseMoves((data ?? []).map((m: any) => ({
        action_id: m.action_id,
        action_statement: m.action_statement,
        domain_name: m.competencies?.domains?.domain_name ?? '—',
        competency_name: m.competencies?.name ?? '—',
      })));
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
      toast({ title: 'Error', description: err.message || 'AI suggestion failed', variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  const filteredBrowse = browseMoves.filter(m =>
    !browseSearch || m.action_statement.toLowerCase().includes(browseSearch.toLowerCase()) ||
    m.domain_name.toLowerCase().includes(browseSearch.toLowerCase()) ||
    m.competency_name.toLowerCase().includes(browseSearch.toLowerCase())
  );

  const slotLabel = slot ? `Slot ${slot.displayOrder}` : 'Slot';

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[480px] sm:max-w-[480px] flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="text-base">Pick a move — {slotLabel}</SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="recommended" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-6 mt-4 flex-none">
            <TabsTrigger value="recommended">Recommended</TabsTrigger>
            <TabsTrigger value="ai">Ask AI</TabsTrigger>
            <TabsTrigger value="browse" onClick={loadBrowseMoves}>Browse</TabsTrigger>
          </TabsList>

          {/* Recommended tab */}
          <TabsContent value="recommended" className="flex-1 overflow-y-auto px-6 pb-6 mt-0">
            {filteredRanked.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-4">No recommendations available.</p>
            ) : (
              <div className="space-y-2 mt-3">
                {filteredRanked.map(move => {
                  const domainColor = getDomainColor(move.domainName);
                  return (
                    <div key={move.proMoveId} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-xs px-1.5 py-0.5 rounded font-medium flex-none"
                            style={{ backgroundColor: domainColor }}
                          >
                            {move.domainName}
                          </span>
                        </div>
                        <p className="text-sm font-medium leading-snug line-clamp-2">{move.name}</p>
                        <p className="text-xs text-muted-foreground italic mt-1">{reasonLabel(move)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-none"
                        onClick={() => { onSelect(move.proMoveId, move.name, 'ranked'); onClose(); }}
                      >
                        Pick
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Ask AI tab */}
          <TabsContent value="ai" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 flex flex-col">
            <div className="mt-3 space-y-3">
              <Textarea
                placeholder={`Describe an issue or goal for your ${roleName}s…\ne.g. "Schedule is looking sparse this week" or "Patients aren't rescheduling at checkout"`}
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
                  <><Sparkles className="h-4 w-4 mr-2" />Get Suggestions</>
                )}
              </Button>
            </div>

            {aiLoading && (
              <div className="mt-4 space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
              </div>
            )}

            {aiResult && !aiLoading && (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium">I read this as: </span>{aiResult.interpretation}
                  </p>
                </div>
                {aiResult.suggestions.map((s: any) => {
                  const domainColor = getDomainColor(s.domain_name);
                  return (
                    <div key={s.action_id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-xs px-1.5 py-0.5 rounded font-medium flex-none"
                            style={{ backgroundColor: domainColor }}
                          >
                            {s.domain_name}
                          </span>
                          <span className="text-xs text-muted-foreground">{s.competency_name}</span>
                        </div>
                        <p className="text-sm font-medium leading-snug line-clamp-2">{s.action_statement}</p>
                        <p className="text-xs text-muted-foreground italic mt-1">{s.rationale}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-none"
                        onClick={() => { onSelect(s.action_id, s.action_statement, 'ai'); onClose(); }}
                      >
                        Pick
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Browse tab */}
          <TabsContent value="browse" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 flex flex-col">
            <div className="mt-3 relative flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search moves…"
                value={browseSearch}
                onChange={e => setBrowseSearch(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            {browseLoading ? (
              <div className="mt-3 space-y-2">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            ) : (
              <div className="mt-3 space-y-2 overflow-y-auto">
                {filteredBrowse.map(m => {
                  const domainColor = getDomainColor(m.domain_name);
                  return (
                    <div key={m.action_id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-xs px-1.5 py-0.5 rounded font-medium flex-none"
                            style={{ backgroundColor: domainColor }}
                          >
                            {m.domain_name}
                          </span>
                          <span className="text-xs text-muted-foreground">{m.competency_name}</span>
                        </div>
                        <p className="text-sm font-medium leading-snug line-clamp-2">{m.action_statement}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-none"
                        onClick={() => { onSelect(m.action_id, m.action_statement, 'browse'); onClose(); }}
                      >
                        Pick
                      </Button>
                    </div>
                  );
                })}
                {filteredBrowse.length === 0 && !browseLoading && (
                  <p className="text-sm text-muted-foreground mt-4 text-center">No moves found.</p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
