import { useState } from 'react';
import { useLeadMeetingRequests } from '@/hooks/useLeadMeetingRequests';
import { MEETING_STATUS_META, DEFAULT_BOOKING_LINK } from '@/types/leadFocus';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const STATUS_STYLE: Record<string, string> = {
  sent: 'bg-[hsl(38_92%_50%_/_0.14)] text-[#b45309]',
  opened: 'bg-[hsl(215_90%_45%_/_0.13)] text-[#1d4ed8]',
  booked: 'bg-[hsl(160_84%_30%_/_0.14)] text-[#047857]',
};

export function SchedulingTab() {
  const { leads, sent, isLoading, sendRequest } = useLeadMeetingRequests();
  const [leadId, setLeadId] = useState('');
  const [note, setNote] = useState('');
  const leadName = (id: string) => leads.find((l) => l.id === id)?.name ?? 'the lead';

  const send = () => {
    if (!leadId) { toast({ title: 'Pick a lead first' }); return; }
    if (!note.trim()) { toast({ title: 'Add a reason so it is not out of the blue' }); return; }
    sendRequest.mutate({ leadStaffId: leadId, note: note.trim() }, {
      onSuccess: () => { toast({ title: `Nudge sent to ${leadName(leadId)} · on their home now` }); setNote(''); },
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Scheduling a 1:1</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Nudge a lead to book time with you. They pick the slot on your Google booking link, and Google handles the calendar and attendance.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.35fr_1fr]">
        <div className="rounded-xl border p-4">
          <h3 className="mb-3 text-sm font-bold">Send a nudge</h3>
          <div className="mb-1.5 text-[12.5px] font-semibold text-foreground/80">Which lead</div>
          <select value={leadId} onChange={(e) => setLeadId(e.target.value)}
            className="mb-3 w-full rounded-lg border bg-background px-3 py-2 text-sm">
            <option value="">Select a lead…</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <div className="mb-1.5 text-[12.5px] font-semibold text-foreground/80">Why <span className="font-normal text-muted-foreground">— so it is not out of the blue</span></div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Want to talk through the South Austin no-charge conversations before they harden into a habit." />
          <Button className="mt-3" disabled={sendRequest.isPending} onClick={send}>
            {sendRequest.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : 'Send nudge →'}
          </Button>
          <p className="mt-2.5 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Shows on their Pro Moves home with your reason, and emails them. They tap <b>Find a time</b> → your link <span className="font-semibold text-[color:var(--domain-clinical,#0E7C86)]">{DEFAULT_BOOKING_LINK.replace('https://', '')}</span>.
          </p>
        </div>

        <div className="rounded-xl border p-4">
          <h3 className="mb-3 text-sm font-bold">Nudges you have sent</h3>
          {isLoading ? <Skeleton className="h-16 w-full" /> : sent.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">Nothing sent yet.</p>
          ) : sent.map((r) => (
            <div key={r.id} className="mb-2.5 rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <b className="text-[13.5px]">{leadName(r.lead_staff_id)}</b>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_STYLE[r.status] ?? ''}`}>{MEETING_STATUS_META[r.status].label}</span>
              </div>
              {r.note && <p className="mt-1.5 text-[12.5px] text-muted-foreground">“{r.note}”</p>}
            </div>
          ))}
          <p className="mt-3 text-xs text-muted-foreground">“Opened” means the lead has seen it on their home. Booking happens on your Google link.</p>
        </div>
      </div>
    </div>
  );
}
