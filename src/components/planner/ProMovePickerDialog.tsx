import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { Search } from 'lucide-react';
import { getDomainColor } from '@/lib/domainColors';
import { getDomainOrderIndex } from '@/lib/domainUtils';
import { fetchEligibleProMoves } from '@/lib/proMoveEligibility';
import { fetchContentOverrides, resolveStatement } from '@/lib/contentOverrides';

interface ProMove {
  action_id: number | null;   // null for org-custom moves (they use UUID id)
  org_move_id: string | null; // UUID for org-custom moves
  action_statement: string;
  competency_id: number | null;
  competencies: {
    name: string;
    domain_id: number;
    domains: { domain_name: string };
  } | null;
  source: 'platform' | 'org';
}

interface ProMovePickerDialogProps {
  open: boolean;
  onClose: () => void;
  roleId: number;
  onSelect: (actionId: number | null, orgMoveId?: string) => void;
  orgId?: string; // When provided, hides moves the org has marked not-visible, and adds org custom moves
  practiceType?: string;
}

/**
 * Informational "N moves hidden by your organization's library settings"
 * banner count. org_visible_pro_moves already excludes hidden moves from
 * its result, so this is a small separate query: how many of this org's
 * hidden platform moves would otherwise have been eligible for this role
 * (active, matching the org's practice type)?
 */
async function fetchHiddenPlatformMoveCount(orgId: string, roleId: number): Promise<number> {
  const { data: org } = await supabase
    .from('organizations')
    .select('practice_type')
    .eq('id', orgId)
    .maybeSingle();
  if (!org?.practice_type) return 0;

  const { data: hiddenOverrides } = await (supabase as any)
    .from('organization_pro_move_overrides')
    .select('pro_move_id')
    .eq('org_id', orgId)
    .eq('is_hidden', true);
  const hiddenIds = (hiddenOverrides ?? []).map((o: any) => o.pro_move_id);
  if (hiddenIds.length === 0) return 0;

  const { data: matches } = await supabase
    .from('pro_moves')
    .select('action_id')
    .eq('role_id', roleId)
    .eq('active', true)
    .is('owner_org_id', null)
    .overlaps('practice_types', [org.practice_type])
    .in('action_id', hiddenIds);
  return (matches ?? []).length;
}

export function ProMovePickerDialog({
  open,
  onClose,
  roleId,
  onSelect,
  orgId,
  practiceType,
}: ProMovePickerDialogProps) {
  const [proMoves, setProMoves] = useState<ProMove[]>([]);
  const [filteredMoves, setFilteredMoves] = useState<ProMove[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hiddenCount, setHiddenCount] = useState(0);

  useEffect(() => {
    if (open) loadProMoves();
  }, [open, roleId, orgId, practiceType]);

  useEffect(() => {
    filterMoves();
  }, [searchQuery, selectedDomain, proMoves]);

  const loadProMoves = async () => {
    setLoading(true);
    setHiddenCount(0);

    // PML-2c: one shared eligibility rule. When an org is known,
    // fetchEligibleProMoves calls the exact same org_visible_pro_moves RPC
    // the sequencer uses, so this dialog can never re-diverge into its own
    // ad-hoc practice-type/hidden-list logic. This also fixes the bug the
    // audit flagged (finding D): this dialog used to skip practice_type
    // filtering entirely whenever orgId was passed, which was every real
    // caller, so it could leak another practice type's moves into the
    // picker. Org-custom moves come back from the same call (they match on
    // owner_org_id), so there is no separate org-custom query any more.
    if (orgId) {
      const [eligible, hiddenCountForRole, orgMoves] = await Promise.all([
        fetchEligibleProMoves(orgId, roleId),
        fetchHiddenPlatformMoveCount(orgId, roleId),
        // Dual-read during the PML-2a transition: org-custom rows not yet
        // folded into pro_moves still live in organization_pro_moves. Once
        // the fold migration runs, every row here has migrated_action_id
        // set and this returns nothing (no duplicate listing), and those
        // moves show up via `eligible` above instead.
        (supabase as any)
          .from('organization_pro_moves')
          .select(`
            id, action_statement, competency_id,
            competencies!organization_pro_moves_competency_id_fkey(
              competency_id, name, domain_id,
              domains!fk_competencies_domain_id(domain_name)
            )
          `)
          .eq('org_id', orgId)
          .eq('role_id', roleId)
          .eq('active', true)
          .is('migrated_action_id' as any, null),
      ]);

      setHiddenCount(hiddenCountForRole);

      const platformIds = eligible.filter(m => m.source === 'platform').map(m => m.actionId);
      const overrides = await fetchContentOverrides(orgId, platformIds);

      // Competencies + domains for the eligible set (the RPC returns
      // competency_id but not the joined name/domain).
      const competencyIds = [...new Set(eligible.map(m => m.competencyId).filter((id): id is number => id != null))];
      const { data: competenciesData } = competencyIds.length
        ? await supabase
            .from('competencies')
            .select('competency_id, name, domain_id, domains:fk_competencies_domain_id(domain_id, domain_name)')
            .in('competency_id', competencyIds)
        : { data: [] };
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

      const platformEnriched: ProMove[] = eligible
        .filter(m => m.source === 'platform')
        .map(m => ({
          action_id: m.actionId,
          org_move_id: null,
          action_statement: resolveStatement(m.actionId, m.actionStatement, overrides),
          competency_id: m.competencyId,
          competencies: m.competencyId != null ? compMap.get(m.competencyId) || null : null,
          source: 'platform',
        }));

      // Migrated org-custom moves (real pro_moves rows, owner_org_id = org)
      // returned by the RPC alongside the platform ones.
      const migratedOrgEnriched: ProMove[] = eligible
        .filter(m => m.source === 'org_custom')
        .map(m => ({
          action_id: m.actionId,
          org_move_id: null,
          action_statement: m.actionStatement,
          competency_id: m.competencyId,
          competencies: m.competencyId != null ? compMap.get(m.competencyId) || null : null,
          source: 'org',
        }));

      // Not-yet-migrated org-custom moves (legacy organization_pro_moves rows).
      const legacyOrgEnriched: ProMove[] = ((orgMoves as any).data ?? []).map((m: any) => ({
        action_id: null,
        org_move_id: m.id,
        action_statement: m.action_statement,
        competency_id: m.competency_id ?? null,
        competencies: m.competencies
          ? {
              name: m.competencies.name,
              domain_id: m.competencies.domain_id,
              domains: { domain_name: m.competencies.domains?.domain_name ?? '' },
            }
          : null,
        source: 'org',
      }));

      finalizeMoves([...platformEnriched, ...migratedOrgEnriched, ...legacyOrgEnriched]);
      return;
    }

    // No org context (rare, super-admin/platform testing surfaces): plain
    // practice-type filter, no visibility overrides or org-custom moves
    // apply (there is no org).
    let movesQuery = supabase
      .from('pro_moves')
      .select('action_id, action_statement, competency_id')
      .eq('role_id', roleId)
      .eq('active', true)
      .is('owner_org_id', null);

    if (practiceType) {
      movesQuery = movesQuery.contains('practice_types', [practiceType]);
    }

    const { data: movesData } = await movesQuery;

    const competencyIds = [...new Set((movesData ?? []).map(m => m.competency_id))];
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

    const platformEnriched: ProMove[] = (movesData ?? []).map(m => ({
      action_id: m.action_id,
      org_move_id: null,
      action_statement: m.action_statement,
      competency_id: m.competency_id,
      competencies: compMap.get(m.competency_id) || null,
      source: 'platform',
    }));

    finalizeMoves(platformEnriched);
  };

  const finalizeMoves = (allMoves: ProMove[]) => {

    // Sort: domain order → competency_id → action_id
    allMoves.sort((a, b) => {
      const dA = a.competencies?.domains?.domain_name || '';
      const dB = b.competencies?.domains?.domain_name || '';
      const orderA = getDomainOrderIndex(dA);
      const orderB = getDomainOrderIndex(dB);
      if (orderA !== orderB) return orderA - orderB;

      const compIdA = a.competency_id ?? 0;
      const compIdB = b.competency_id ?? 0;
      if (compIdA !== compIdB) return compIdA - compIdB;

      // Org moves always come after platform moves within the same competency
      if (a.source !== b.source) return a.source === 'org' ? 1 : -1;

      return (a.action_id ?? 0) - (b.action_id ?? 0);
    });

    setProMoves(allMoves);
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
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

          {/* Hidden count note */}
          {hiddenCount > 0 && (
            <div className="px-5 py-2 border-b bg-amber-50 dark:bg-amber-950/20">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {hiddenCount} move{hiddenCount > 1 ? 's' : ''} hidden by your organization's library settings
              </p>
            </div>
          )}

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
                      key={pm.org_move_id ?? pm.action_id}
                      onClick={() => {
                        onSelect(pm.action_id, pm.org_move_id ?? undefined);
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
                          {pm.source === 'org' && (
                            <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                              Org custom
                            </Badge>
                          )}
                          {domain && (
                            <Badge
                              variant="secondary"
                              className="text-xs"
                              style={{
                                backgroundColor: getDomainColor(domain),
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
