import { useLeadFocusForLead } from '@/hooks/useLeadFocus';
import { Skeleton } from '@/components/ui/skeleton';
import { Target } from 'lucide-react';

/**
 * Lead-home card: Ariyana's focus for the current week, read-only. Replaces the
 * retired "Lead Pro Move" dual-panel. Shown only for leads (staff.is_lead).
 */
export function LeadFocusHomeCard({ isLead }: { isLead?: boolean }) {
  const { data: week, isLoading } = useLeadFocusForLead(isLead);
  if (!isLead) return null;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b bg-[hsl(184_80%_27%_/_0.06)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(184_80%_27%_/_0.14)] px-2.5 py-0.5 text-[11.5px] font-bold text-[color:var(--domain-clinical,#0E7C86)]">
            <Target className="h-3.5 w-3.5" />This week at your location
          </span>
          <span className="text-xs text-muted-foreground">from Ariyana</span>
        </div>
      </div>
      <div className="p-4">
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : !week || week.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ariyana hasn't set this week yet. It shows up here the moment she schedules it.</p>
        ) : (
          <>
            {week.items.map((it, i) => (
              <div key={it.id} className="flex items-start gap-3 border-t py-2.5 first:border-0">
                <span className="grid h-6 w-6 flex-none place-items-center self-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground">{i + 1}</span>
                <div className="self-center text-[14.5px] font-semibold">{it.text}</div>
              </div>
            ))}
            {week.framing && <p className="mt-3 text-sm italic text-muted-foreground">“{week.framing}”</p>}
            <p className="mt-3.5 text-xs text-muted-foreground">Your record of the meeting. Carry it into your location this week.</p>
          </>
        )}
      </div>
    </div>
  );
}
