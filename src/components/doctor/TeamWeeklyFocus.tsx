import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { getDomainColor, getDomainColorRichRaw } from '@/lib/domainColors';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const ROLES = [
  { id: 1, label: 'DFI' },
  { id: 2, label: 'RDA' },
  { id: 3, label: 'Office Manager' },
] as const;

interface SimpleAssignment {
  id: string;
  action_id: number;
  action_statement: string;
  domain_name: string;
  display_order: number;
}

function getThisMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

function WeekOfHeader() {
  const monday = new Date(getThisMonday() + 'T12:00:00');
  const formatted = monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return <p className="text-sm text-muted-foreground mb-4">Week of {formatted}</p>;
}

function useTeamAssignments(roleId: number) {
  return useQuery({
    queryKey: ['team-weekly-assignments', roleId],
    queryFn: async (): Promise<SimpleAssignment[]> => {
      const mondayStr = getThisMonday();

      // 1. Get locked global assignments for this role + week
      const { data: rows, error } = await supabase
        .from('weekly_assignments')
        .select('id, action_id, display_order')
        .eq('source', 'global')
        .eq('role_id', roleId)
        .eq('week_start_date', mondayStr)
        .eq('status', 'locked')
        .is('org_id', null)
        .is('superseded_at', null)
        .order('display_order');

      if (error) throw error;
      if (!rows?.length) return [];

      // 2. Fetch pro move meta (statement + domain) via simple separate queries
      const actionIds = rows.map(r => r.action_id).filter((id): id is number => id != null);
      if (!actionIds.length) return [];

      const { data: moves } = await supabase
        .from('pro_moves')
        .select('action_id, action_statement, competency_id')
        .in('action_id', actionIds);

      const compIds = [...new Set((moves || []).map(m => m.competency_id).filter(Boolean))];

      const { data: comps } = compIds.length > 0
        ? await supabase
            .from('competencies')
            .select('competency_id, domain_id')
            .in('competency_id', compIds as number[])
        : { data: [] };

      const domainIds = [...new Set((comps || []).map(c => c.domain_id).filter(Boolean))];

      const { data: domains } = domainIds.length > 0
        ? await supabase
            .from('domains')
            .select('domain_id, domain_name')
            .in('domain_id', domainIds as number[])
        : { data: [] };

      // Build lookup maps
      const domainMap = new Map((domains || []).map(d => [d.domain_id, d.domain_name || '']));
      const compDomainMap = new Map((comps || []).map(c => [c.competency_id, domainMap.get(c.domain_id!) || '']));
      const moveMap = new Map((moves || []).map(m => [m.action_id, {
        statement: m.action_statement || '',
        domain: compDomainMap.get(m.competency_id!) || '',
      }]));

      return rows.map(r => {
        const meta = moveMap.get(r.action_id!);
        return {
          id: r.id,
          action_id: r.action_id!,
          action_statement: meta?.statement || '',
          domain_name: meta?.domain || '',
          display_order: r.display_order,
        };
      });
    },
    staleTime: 2 * 60 * 1000,
  });
}

function RoleSection({ roleId, label }: { roleId: number; label: string }) {
  const [open, setOpen] = useState(true);
  const { data: assignments, isLoading } = useTeamAssignments(roleId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full text-left py-2">
        <ChevronDown className={cn("h-4 w-4 transition-transform text-muted-foreground", !open && "-rotate-90")} />
        <span className="font-semibold text-sm">{label}</span>
        <span className="text-xs text-muted-foreground">({assignments?.length || 0})</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pb-4">
        {(!assignments || assignments.length === 0) ? (
          <p className="text-sm text-muted-foreground italic pl-6">No assignments this week</p>
        ) : (
          assignments.map((a) => <AssignmentCard key={a.id} assignment={a} />)
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function AssignmentCard({ assignment }: { assignment: SimpleAssignment }) {
  const domainName = assignment.domain_name;
  const domainColor = domainName ? getDomainColor(domainName) : 'hsl(var(--primary))';
  const domainColorRich = domainName ? `hsl(${getDomainColorRichRaw(domainName)})` : 'hsl(var(--primary))';

  return (
    <div className="flex bg-white dark:bg-slate-800 rounded-xl overflow-hidden border border-border/50 shadow-sm">
      <div
        className="w-8 shrink-0 flex flex-col items-center justify-center"
        style={{ backgroundColor: domainColor }}
      >
        <span
          className="text-[10px] font-bold tracking-widest uppercase"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: domainColorRich }}
        >
          {domainName}
        </span>
      </div>
      <div className="flex-1 p-3">
        <p className="text-sm font-medium leading-relaxed text-foreground/90">
          {assignment.action_statement || 'Untitled Pro Move'}
        </p>
      </div>
    </div>
  );
}

export default function TeamWeeklyFocus() {
  return (
    <div className="space-y-2 mt-4">
      <WeekOfHeader />
      {ROLES.map((r) => (
        <RoleSection key={r.id} roleId={r.id} label={r.label} />
      ))}
    </div>
  );
}
