import { useEffect } from 'react';
import { useLeadIncomingRequest } from '@/hooks/useLeadMeetingRequests';
import { DEFAULT_BOOKING_LINK } from '@/types/leadFocus';
import { Button } from '@/components/ui/button';
import { CalendarClock } from 'lucide-react';

/**
 * Lead-home scheduling card: shows an incoming "let's find time" nudge from Ariyana
 * (with her rationale) and a standing "Book time" button. Viewing it flips the
 * nudge sent → opened so Ariyana can see it landed. Shown only for leads.
 */
export function LeadMeetingRequestCard({ staffId, isLead }: { staffId?: string | null; isLead?: boolean }) {
  const { request, markOpened, markBooked } = useLeadIncomingRequest(isLead ? staffId : null);

  useEffect(() => {
    if (request && request.status === 'sent') markOpened.mutate(request.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.id, request?.status]);

  if (!isLead) return null;

  const book = () => {
    if (request) markBooked.mutate(request.id);
    window.open(DEFAULT_BOOKING_LINK, '_blank', 'noopener');
  };

  return (
    <div className="rounded-xl border bg-card p-4">
      {request && (
        <div className="mb-3.5 rounded-xl border border-[color:var(--domain-clinical,#0E7C86)] bg-[hsl(184_80%_27%_/_0.05)] p-3.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(184_80%_27%_/_0.14)] px-2.5 py-0.5 text-[11.5px] font-bold text-[color:var(--domain-clinical,#0E7C86)]">
              <CalendarClock className="h-3.5 w-3.5" />Ariyana would like to meet
            </span>
          </div>
          {request.note && <p className="mt-2 text-[13.5px]">“{request.note}”</p>}
          <Button size="sm" className="mt-2.5" onClick={book}>Find a time →</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <h3 className="text-sm font-bold">Need to talk something through?</h3>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">Book time with Ariyana whenever you need it.</p>
        </div>
        <Button variant="outline" onClick={book}>Book time with Ariyana →</Button>
      </div>
    </div>
  );
}
