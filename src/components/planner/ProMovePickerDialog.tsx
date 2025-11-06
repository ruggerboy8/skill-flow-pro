import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Search } from 'lucide-react';
import { getDomainColor } from '@/lib/domainColors';

interface ProMove {
  action_id: number;
  action_statement: string;
  competency_id: number;
  competencies: {
    name: string;
    domain_id: number;
    domains: { domain_name: string };
  } | null;
}

interface ProMovePickerDialogProps {
  open: boolean;
  onClose: () => void;
  roleId: number;
  onSelect: (actionId: number) => void;
}

export function ProMovePickerDialog({
  open,
  onClose,
  roleId,
  onSelect,
}: ProMovePickerDialogProps) {
  const [proMoves, setProMoves] = useState<ProMove[]>([]);
  const [filteredMoves, setFilteredMoves] = useState<ProMove[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) loadProMoves();
  }, [open, roleId]);

  useEffect(() => {
    filterMoves();
  }, [searchQuery, selectedDomain, proMoves]);

  const loadProMoves = async () => {
    setLoading(true);

    // 1) moves
    const { data: movesData } = await supabase
      .from('pro_moves')
      .select('action_id, action_statement, competency_id')
      .eq('role_id', roleId)
      .eq('active', true);

    // 2) competencies + domains
    const competencyIds = [...new Set(movesData?.map(m => m.competency_id) || [])];
    const { data: competenciesData } = await supabase
      .from('competencies')
      .select(
        'competency_id, name, domain_id, domains:fk_competencies_domain_id(domain_id, domain_name)'
      )
      .in('competency_id', competencyIds);

    const compMap = new Map(
      (competenciesData || []).map(c => [
        c.competency_id,
        {
          name: c.name,
          domain_id: c.domain_id,
          domains: { domain_name: (c.domains as any)?.domain_name || '' },
        },
      ])
    );

    const enriched = (movesData || []).map(m => ({
      action_id: m.action_id,
      action_statement: m.action_statement,
      competency_id: m.competency_id,
      competencies: compMap.get(m.competency_id) || null,
    }));

    // sort: domain → competency → id
    enriched.sort((a, b) => {
      const dA = a.competencies?.domains?.domain_name || '';
      const dB = b.competencies?.domains?.domain_name || '';
      if (dA !== dB) return dA.localeCompare(dB);

      const cA = a.competencies?.name || '';
      const cB = b.competencies?.name || '';
      if (cA !== cB) return cA.localeCompare(cB);

      return a.action_id - b.action_id;
    });

    setProMoves(enriched);
    setLoading(false);
  };

  const filterMoves = () => {
    let next = proMoves;

    if (selectedDomain) {
      next = next.filter(pm => (pm.competencies as any)?.domains?.domain_name === selectedDomain);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      next = next.filter(
        pm =>
          pm.action_statement.toLowerCase().includes(q) ||
          (pm.competencies as any)?.name?.toLowerCase().includes(q)
      );
    }

    setFilteredMoves(next);
  };

  const domains = Array.from(
    new Set(proMoves.map(pm => (pm.competencies as any)?.domains?.domain_name).filter(Boolean))
  ).sort();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent
        className="w-[95vw] sm:max-w-[960px] max-h-[85vh] p-0 overflow-hidden"
      >
        <div className="flex flex-col h-[85vh]">
          {/* Header */}
          <DialogHeader className="px-5 pt-5 pb-3 border-b">
            <DialogTitle>Choose Pro-Move from Library</DialogTitle>
          </DialogHeader>

          {/* Controls (non-scrolling) */}
          <div className="px-5 py-3 border-b bg-background">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by move or competency…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={selectedDomain === null ? 'default' : 'outline'}
                  onClick={() => setSelectedDomain(null)}
                >
                  All Domains
                </Button>
                {domains.map((domain) => (
                  <Button
                    key={domain}
                    size="sm"
                    variant={selectedDomain === domain ? 'default' : 'outline'}
                    onClick={() => setSelectedDomain(domain)}
                  >
                    {domain}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Results (scrolling) */}
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading…</div>
            ) : filteredMoves.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No pro-moves found</div>
            ) : (
              <div className="p-4 space-y-2">
                {filteredMoves.map((pm) => {
                  const domain = (pm.competencies as any)?.domains?.domain_name || '';
                  const compName = (pm.competencies as any)?.name || '';
                  return (
                    <button
                      key={pm.action_id}
                      onClick={() => {
                        onSelect(pm.action_id);
                        onClose();
                      }}
                      className="
                        w-full text-left border rounded-lg px-4 py-3
                        hover:bg-accent transition
                        whitespace-normal break-words
                      "
                    >
                      <div className="space-y-1">
                        <div className="font-medium leading-snug">
                          <span className="break-words">{pm.action_statement}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {domain && (
                            <Badge
                              variant="secondary"
                              className="text-xs"
                              style={{
                                backgroundColor: `hsl(${getDomainColor(domain)})`,
                              }}
                            >
                              {domain}
                            </Badge>
                          )}
                          {compName && (
                            <span className="text-xs text-muted-foreground">{compName}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
