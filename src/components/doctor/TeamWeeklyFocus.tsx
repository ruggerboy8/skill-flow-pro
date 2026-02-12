import { useWeeklyAssignments, type WeeklyAssignment } from '@/hooks/useWeeklyAssignments';
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

function WeekOfHeader() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  const formatted = monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return <p className="text-sm text-muted-foreground mb-4">Week of {formatted}</p>;
}

function RoleSection({ roleId, label }: { roleId: number; label: string }) {
  const [open, setOpen] = useState(true);
  const { data: assignments, isLoading } = useWeeklyAssignments({
    roleId,
    onboardingActive: false,
  });

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
        <ChevronDown className={cn("h-4 w-4 transition-transform text-muted-foreground", open && "rotate-0", !open && "-rotate-90")} />
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

function AssignmentCard({ assignment }: { assignment: WeeklyAssignment }) {
  const domainName = assignment.domain_name;
  const domainColor = domainName ? getDomainColor(domainName) : 'hsl(var(--primary))';
  const domainColorRich = domainName ? `hsl(${getDomainColorRichRaw(domainName)})` : 'hsl(var(--primary))';

  return (
    <div className="flex bg-white dark:bg-slate-800 rounded-xl overflow-hidden border border-border/50 shadow-sm">
      {/* Spine */}
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
      {/* Content */}
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
