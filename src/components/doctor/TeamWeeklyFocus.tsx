import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { getDomainPastelVar, getDomainInk } from '@/lib/domainColors';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { LearnerLearnDrawer } from '@/components/learner/LearnerLearnDrawer';
import { useUserRole } from '@/hooks/useUserRole';
import { resolveOrgTimezoneById } from '@/lib/locationState';
import { getAssignmentWeekMondayStr } from '@/lib/submissionPolicy';

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

// ASG-1 Fix 2 (Codex P2): the query below reads org-scoped
// weekly_assignments, an org-level table, so its week key must be the same
// org-canonical Monday locationState.assembleWeek uses — not a hardcoded
// Chicago Monday, which disagrees with the data for a non-Central org
// during the Sunday-night rollover window. Falls back to 'America/Chicago'
// while `orgId` is still resolving (or has none), matching assembleWeek.
function useOrgCanonicalMonday(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-canonical-monday', orgId],
    queryFn: async (): Promise<string> => {
      const tz = orgId ? await resolveOrgTimezoneById(orgId) : 'America/Chicago';
      return getAssignmentWeekMondayStr(new Date(), tz);
    },
    staleTime: 2 * 60 * 1000,
  });
}

function WeekOfHeader({ mondayStr }: { mondayStr: string | undefined }) {
  if (!mondayStr) return null;
  const monday = new Date(mondayStr + 'T12:00:00');
  const formatted = monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return <p className="text-sm text-muted-foreground mb-4">Week of {formatted}</p>;
}

/**
 * Fetch global weekly_assignments using flat (non-nested) queries to avoid PGRST200.
 * Filters out self_select assignments. Fetches all 3 roles in one batch.
 */
function useAllRoleAssignments(orgId: string | undefined, mondayStr: string | undefined) {
  return useQuery({
    queryKey: ['team-weekly-all-roles', orgId, mondayStr],
    enabled: !!mondayStr,
    queryFn: async (): Promise<Record<number, SimpleAssignment[]>> => {
      const result: Record<number, SimpleAssignment[]> = { 1: [], 2: [], 3: [] };

      if (!orgId || !mondayStr) return result;

      // 1. Get locked org-scoped assignments for all 3 roles, exclude self_select
      const q = supabase
        .from('weekly_assignments')
        .select('id, action_id, display_order, role_id, self_select')
        .in('role_id', [1, 2, 3])
        .eq('week_start_date', mondayStr)
        .eq('status', 'locked')
        .eq('self_select', false)
        .eq('org_id', orgId)
        .is('superseded_at', null)
        .order('display_order');

      const { data: rows, error } = await q;

      if (error) throw error;
      if (!rows?.length) return result;

      // 2. Get unique action_ids and fetch pro_move details (flat queries)
      const actionIds = [...new Set(rows.map(r => r.action_id).filter((id): id is number => id != null))];
      if (!actionIds.length) return result;

      const { data: moves } = await supabase
        .from('pro_moves')
        .select('action_id, action_statement, competency_id')
        .in('action_id', actionIds);

      const compIds = [...new Set((moves || []).map(m => m.competency_id).filter(Boolean))];

      const { data: comps } = compIds.length > 0
        ? await supabase.from('competencies').select('competency_id, domain_id').in('competency_id', compIds as number[])
        : { data: [] };

      const domainIds = [...new Set((comps || []).map(c => c.domain_id).filter(Boolean))];

      const { data: domains } = domainIds.length > 0
        ? await supabase.from('domains').select('domain_id, domain_name').in('domain_id', domainIds as number[])
        : { data: [] };

      // Build lookup maps
      const domainMap = new Map((domains || []).map(d => [d.domain_id, d.domain_name || '']));
      const compDomainMap = new Map((comps || []).map(c => [c.competency_id, domainMap.get(c.domain_id!) || '']));
      const moveMap = new Map((moves || []).map(m => [m.action_id, {
        statement: m.action_statement || '',
        domain: compDomainMap.get(m.competency_id!) || '',
      }]));

      // 3. Group by role
      for (const r of rows) {
        const roleId = r.role_id;
        if (!roleId || !r.action_id) continue;
        const meta = moveMap.get(r.action_id);
        result[roleId].push({
          id: r.id,
          action_id: r.action_id,
          action_statement: meta?.statement || '',
          domain_name: meta?.domain || '',
          display_order: r.display_order,
        });
      }

      return result;
    },
    staleTime: 2 * 60 * 1000,
  });
}

function RoleSection({ roleId, label, assignments, isLoading, onOpenDrawer }: { roleId: number; label: string; assignments: SimpleAssignment[]; isLoading: boolean; onOpenDrawer: (a: SimpleAssignment) => void }) {
  const [open, setOpen] = useState(true);

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
        <span className="text-xs text-muted-foreground">({assignments.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pb-4">
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground italic pl-6">No assignments this week</p>
        ) : (
          assignments.map((a) => <AssignmentCard key={a.id} assignment={a} onOpenDrawer={() => onOpenDrawer(a)} />)
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function AssignmentCard({ assignment, onOpenDrawer }: { assignment: SimpleAssignment; onOpenDrawer: () => void }) {
  const domainName = assignment.domain_name;
  const domainColor = domainName ? getDomainPastelVar(domainName) : 'hsl(var(--primary))';
  const domainInk = domainName ? getDomainInk(domainName) : 'hsl(var(--primary-foreground))';

  return (
    <div className="flex bg-card rounded-xl overflow-hidden border border-border/50 shadow-sm">
      <div
        className="w-8 shrink-0 flex flex-col items-center justify-center"
        style={{ backgroundColor: domainColor }}
      >
        <span
          className="text-2xs font-bold tracking-widest uppercase"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: domainInk }}
        >
          {domainName}
        </span>
      </div>
      <div className="flex-1 p-3 flex items-center justify-between gap-2">
        <p className="text-sm font-medium leading-relaxed text-foreground/90">
          {assignment.action_statement || 'Untitled Pro Move'}
        </p>
        <button
          onClick={onOpenDrawer}
          className="shrink-0 p-1.5 rounded-md hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
          aria-label="View learning materials"
        >
          <GraduationCap className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function TeamWeeklyFocus() {
  const { organizationId } = useUserRole();
  const { data: weekStartDate } = useOrgCanonicalMonday(organizationId);
  const { data: assignmentsByRole, isLoading } = useAllRoleAssignments(organizationId, weekStartDate);
  const [drawerItem, setDrawerItem] = useState<SimpleAssignment | null>(null);

  return (
    <div className="space-y-2 mt-4">
      <WeekOfHeader mondayStr={weekStartDate} />
      {ROLES.map((r) => (
        <RoleSection
          key={r.id}
          roleId={r.id}
          label={r.label}
          assignments={assignmentsByRole?.[r.id] || []}
          isLoading={isLoading}
          onOpenDrawer={setDrawerItem}
        />
      ))}

      {drawerItem && (
        <LearnerLearnDrawer
          open={!!drawerItem}
          onOpenChange={(open) => { if (!open) setDrawerItem(null); }}
          actionId={drawerItem.action_id}
          proMoveTitle={drawerItem.action_statement}
          domainName={drawerItem.domain_name}
          lastPracticed={null}
          avgConfidence={null}
        />
      )}
    </div>
  );
}
