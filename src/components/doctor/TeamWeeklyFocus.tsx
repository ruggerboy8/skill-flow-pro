import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { getDomainColor, getDomainColorRichRaw } from '@/lib/domainColors';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

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

/**
 * For each role, find the first staff member at the doctor's location,
 * then look up their weekly_scores for this week to get assigned (non-self-select) pro moves.
 */
function useTeamAssignmentsByLocation(locationId: string | null) {
  return useQuery({
    queryKey: ['team-weekly-by-location', locationId],
    queryFn: async (): Promise<Record<number, SimpleAssignment[]>> => {
      if (!locationId) return { 1: [], 2: [], 3: [] };

      const mondayStr = getThisMonday();
      const result: Record<number, SimpleAssignment[]> = { 1: [], 2: [], 3: [] };

      // 1. Find one staff member per role at this location
      const { data: staffRows } = await supabase
        .from('staff')
        .select('id, role_id')
        .eq('primary_location_id', locationId)
        .eq('is_participant', true)
        .eq('is_paused', false)
        .in('role_id', [1, 2, 3]);

      if (!staffRows?.length) return result;

      // Pick first staff per role
      const staffByRole: Record<number, string> = {};
      for (const s of staffRows) {
        if (s.role_id && !staffByRole[s.role_id]) {
          staffByRole[s.role_id] = s.id;
        }
      }

      const staffIds = Object.values(staffByRole);
      if (!staffIds.length) return result;

      // 2. Get weekly_scores for these staff members this week, only site-assigned (site_action_id not null)
      const { data: scores } = await supabase
        .from('weekly_scores')
        .select('staff_id, site_action_id, weekly_focus_id')
        .in('staff_id', staffIds)
        .eq('week_of', mondayStr)
        .not('site_action_id', 'is', null);

      if (!scores?.length) return result;

      // 3. Collect unique action_ids and fetch pro_move details
      const actionIds = [...new Set(scores.map(s => s.site_action_id!))];
      
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

      // 4. Group by role via staffByRole mapping
      const staffIdToRole = new Map(Object.entries(staffByRole).map(([role, sid]) => [sid, Number(role)]));
      const seen = new Map<string, Set<number>>(); // per role, track unique action_ids

      for (const score of scores) {
        const roleId = staffIdToRole.get(score.staff_id!);
        if (!roleId || !score.site_action_id) continue;

        if (!seen.has(String(roleId))) seen.set(String(roleId), new Set());
        if (seen.get(String(roleId))!.has(score.site_action_id)) continue;
        seen.get(String(roleId))!.add(score.site_action_id);

        const meta = moveMap.get(score.site_action_id);
        result[roleId].push({
          id: `${score.staff_id}-${score.site_action_id}`,
          action_id: score.site_action_id,
          action_statement: meta?.statement || '',
          domain_name: meta?.domain || '',
          display_order: result[roleId].length,
        });
      }

      return result;
    },
    enabled: !!locationId,
    staleTime: 2 * 60 * 1000,
  });
}

function useDoctorLocation() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['doctor-location', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('staff')
        .select('primary_location_id')
        .eq('user_id', user.id)
        .maybeSingle();
      return data?.primary_location_id || null;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
}

function RoleSection({ roleId, label, assignments, isLoading }: { roleId: number; label: string; assignments: SimpleAssignment[]; isLoading: boolean }) {
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
  const { data: locationId, isLoading: locLoading } = useDoctorLocation();
  const { data: assignmentsByRole, isLoading: assignLoading } = useTeamAssignmentsByLocation(locationId ?? null);

  const isLoading = locLoading || assignLoading;

  return (
    <div className="space-y-2 mt-4">
      <WeekOfHeader />
      {ROLES.map((r) => (
        <RoleSection
          key={r.id}
          roleId={r.id}
          label={r.label}
          assignments={assignmentsByRole?.[r.id] || []}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}
