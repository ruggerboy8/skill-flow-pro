import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';
import { fetchOrgProMoveMetaByIds } from '@/lib/proMoves';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SlotRecord {
  displayOrder: number;
  domainName: string;
  name: string;
}

interface HistoryWeek {
  weekStart: string;
  slots: SlotRecord[];
  isLocked: boolean;
}

interface HistoryStripProps {
  roleId: number;
  orgId?: string;
  onHistoryLoaded?: (weeks: HistoryWeek[]) => void;
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function DomainDot({ domainName, moveName }: { domainName: string; moveName: string }) {
  const color = getDomainColor(domainName);
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-block h-2.5 w-2.5 rounded-full flex-none"
            style={{ backgroundColor: color }}
          />
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[200px]">
          <p className="text-xs font-medium">{domainName}</p>
          <p className="text-xs text-muted-foreground">{moveName}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function HistoryStrip({ roleId, orgId, onHistoryLoaded }: HistoryStripProps) {
  const [weeks, setWeeks] = useState<HistoryWeek[]>([]);
  const [domainCounts, setDomainCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadHistory();
  }, [roleId, orgId]);

  const loadHistory = async () => {
    const today = new Date();
    const sixWeeksAgo = new Date(today);
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
    const startStr = sixWeeksAgo.toISOString().split('T')[0];
    const todayStr = today.toISOString().split('T')[0];

    let query = supabase
      .from('weekly_assignments')
      .select(`
        week_start_date, display_order, action_id, org_move_id, id,
        pro_moves:action_id(
          action_statement,
          competencies:fk_pro_moves_competency_id(
            domains:fk_competencies_domain_id(domain_name)
          )
        )
      `)
      .eq('role_id', roleId)
      .is('location_id', null)
      .is('superseded_at', null)
      .gte('week_start_date', startStr)
      .lt('week_start_date', todayStr)
      .order('week_start_date', { ascending: false })
      .order('display_order');

    query = orgId ? query.eq('org_id', orgId) : query.is('org_id', null);

    const { data: rows } = await query;
    if (!rows) return;

    // Check which are locked (have scores)
    const assignmentIds = rows.map(r => r.id);
    let lockedIds = new Set<string>();
    if (assignmentIds.length > 0) {
      const { data: scores } = await supabase
        .from('weekly_scores')
        .select('assignment_id')
        .in('assignment_id', assignmentIds.map((id: string) => `assign:${id}`));
      (scores || []).forEach((s: any) => {
        lockedIds.add(s.assignment_id.replace('assign:', ''));
      });
    }

    // Resolve org-custom move metadata (rows with org_move_id instead of action_id)
    const orgMoveIds = rows
      .map((r: any) => r.org_move_id)
      .filter((id: string | null): id is string => !!id);
    const orgMeta = orgMoveIds.length > 0
      ? await fetchOrgProMoveMetaByIds(orgMoveIds)
      : new Map();

    // Group by week
    const grouped: Record<string, HistoryWeek> = {};
    rows.forEach((row: any) => {
      const ws = row.week_start_date;
      if (!grouped[ws]) grouped[ws] = { weekStart: ws, slots: [], isLocked: false };
      const om = row.org_move_id ? orgMeta.get(row.org_move_id) : undefined;
      const domainName = row.pro_moves?.competencies?.domains?.domain_name ?? om?.domain ?? '—';
      grouped[ws].slots.push({
        displayOrder: row.display_order,
        domainName,
        name: row.pro_moves?.action_statement ?? om?.statement ?? '',
      });
      if (lockedIds.has(row.id)) grouped[ws].isLocked = true;
    });

    // Sort slots within week
    Object.values(grouped).forEach(w => w.slots.sort((a, b) => a.displayOrder - b.displayOrder));

    // Take up to 6 most-recent weeks
    const sortedWeeks = Object.values(grouped)
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
      .slice(0, 6)
      .reverse(); // oldest → newest left-to-right

    setWeeks(sortedWeeks);
    onHistoryLoaded?.(sortedWeeks);

    // Domain balance counts
    const counts: Record<string, number> = {};
    sortedWeeks.forEach(w => w.slots.forEach(s => {
      if (s.domainName && s.domainName !== '—') counts[s.domainName] = (counts[s.domainName] ?? 0) + 1;
    }));
    setDomainCounts(counts);
  };

  if (weeks.length === 0) return null;

  const totalSlots = Object.values(domainCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-2">
      {/* Week chips */}
      <div className="flex items-end gap-2 overflow-x-auto pb-1">
        <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap flex-none pt-1">
          Last 6 weeks
        </span>
        {weeks.map((week) => (
          <div
            key={week.weekStart}
            className={`flex-none flex flex-col items-center gap-1 rounded-lg border px-3 py-2 min-w-[72px] ${
              week.isLocked ? 'bg-muted/40' : 'bg-card'
            }`}
          >
            <span className="text-2xs text-muted-foreground whitespace-nowrap">
              {formatShortDate(week.weekStart)}
            </span>
            <div className="flex items-center gap-1">
              {week.slots.length > 0
                ? week.slots.map((s, i) => (
                    <DomainDot key={i} domainName={s.domainName} moveName={s.name} />
                  ))
                : <span className="text-2xs text-muted-foreground">—</span>
              }
            </div>
            {week.isLocked && (
              <span className="text-2xs text-muted-foreground">done</span>
            )}
          </div>
        ))}
      </div>

      {/* Domain balance bar */}
      {totalSlots > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
            Mix
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {Object.entries(domainCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([domain, count]) => (
                <span
                  key={domain}
                  className="flex items-center gap-1 text-2xs rounded px-1.5 py-0.5"
                  style={{ backgroundColor: getDomainColor(domain) }}
                >
                  {domain} {count}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
