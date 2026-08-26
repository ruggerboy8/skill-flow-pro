import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLeadFocus } from '@/hooks/useLeadFocus';
import { useCoachingWorkspace } from '@/hooks/useCoachingWorkspace';
import { useLeadMeetings } from '@/hooks/useLeadMeetings';
import { useLeadWeekBlasts } from '@/hooks/useLeadWeekBlasts';
import { useWorkspaceLocations } from '@/hooks/useWorkspaceLocations';
import { SOURCE_META, type SourceType, type CoachingIssue } from '@/types/coachingWorkspace';
import { OUTCOME_META, type HydratedFocusWeek } from '@/types/leadFocus';
import type { LeadMeetingRow } from '@/types/leadMeetings';
import type { LeadWeekBlastRow } from '@/types/leadWeekBlasts';
import { deriveFocusSlotState, deriveMeetingSlotState, meetingsInWeek } from '@/lib/leadMeetingsAndFocus';
import {
  deriveBlastSlotState, blastSlotBadgeStatus, buildSendConfirmBody, shouldConfirmRegenerate,
  type BlastSlotState,
} from '@/lib/leadWeekBlasts';
import { formatDateForDisplay } from '@/lib/dateInputMask';
import { RecordMeetingDialog } from '@/components/training/RecordMeetingDialog';
import { StatusBadge, type BadgeStatus } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import {
  ChevronLeft, ChevronRight, LayoutList, CalendarDays, Sparkles, Loader2, Plus, X, Shield,
  Users, Mail,
} from 'lucide-react';
import { CT_TZ } from '@/lib/centralTime';
import { addDaysToDateString, mondaysInMonth as mondaysInMonthTz } from '@/lib/dateUtils';

// ── date helpers (local; Monday-keyed like the planner) ──────────────────────
// `parse` is display-only (toLocaleDateString), so it's fine to read the
// browser's own local calendar fields. `addDays`/`firstOfMonth`/
// `mondaysInMonth` feed week/month keys back into state and queries, so they
// go through the timezone-explicit helpers instead of a round trip through
// toISOString(), which shifted results a day early for anyone in a
// negative-UTC timezone (Central time).
const parse = (s: string) => new Date(s + 'T12:00:00');
const fmtShort = (s: string) => parse(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtWeek = (s: string) => 'Week of ' + fmtShort(s);
const fmtMonth = (s: string) => parse(s).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const addDays = (s: string, n: number) => addDaysToDateString(s, n, CT_TZ);
const firstOfMonth = (s: string) => `${s.slice(0, 7)}-01`;
const mondaysInMonth = (anchor: string): string[] => mondaysInMonthTz(anchor, CT_TZ);

interface BuilderItem { key: string; text: string; sourceId: string | null; sourceTitle: string | null; polishing?: boolean; aiPolished?: boolean }

export function MeetingsAndFocusTab() {
  const { weeks, currentMonday, publishWeek, isLoading } = useLeadFocus();
  const ws = useCoachingWorkspace();
  const meetingsHook = useLeadMeetings();
  const blastsHook = useLeadWeekBlasts();
  const { data: locations = [] } = useWorkspaceLocations(ws.orgId);
  const weeksByDate = useMemo(() => new Map(weeks.map((w) => [w.week_start_date, w])), [weeks]);

  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedMonday, setSelectedMonday] = useState(currentMonday);
  const [monthAnchor, setMonthAnchor] = useState(firstOfMonth(currentMonday));

  // builder (focus slot)
  const [builderOpen, setBuilderOpen] = useState(false);
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [framing, setFraming] = useState('');
  const [own, setOwn] = useState('');
  const keyRef = useRef(1);
  const nextKey = () => 'k' + (keyRef.current++);

  // meeting dialog
  const [meetingDialog, setMeetingDialog] = useState<{ mode: 'create' | 'view'; meeting: LeadMeetingRow | null } | null>(null);

  const selected = weeksByDate.get(selectedMonday) ?? null;
  const when: 'past' | 'current' | 'future' =
    selectedMonday < currentMonday ? 'past' : selectedMonday === currentMonday ? 'current' : 'future';

  const usedIds = new Set(items.map((i) => i.sourceId).filter(Boolean) as string[]);
  const availIssues = ws.issues.filter((i) => !usedIds.has(i.id));

  const openBuilder = (monday: string) => {
    const w = weeksByDate.get(monday);
    setItems((w?.items ?? []).map((it) => ({
      key: nextKey(), text: it.text, sourceId: it.source_issue_id, sourceTitle: it.sourceIssueTitle ?? null, aiPolished: true,
    })));
    setFraming(w?.framing ?? '');
    setBuilderOpen(true);
  };
  const closeBuilder = () => { setBuilderOpen(false); setItems([]); setFraming(''); setOwn(''); };

  const addIssue = (issue: CoachingIssue) => {
    if (items.length >= 2) return;
    setItems((p) => [...p, { key: nextKey(), text: issue.title, sourceId: issue.id, sourceTitle: issue.title }]);
  };
  const addOwn = () => {
    if (items.length >= 2) { toast({ title: 'Two is the cap' }); return; }
    if (!own.trim()) return;
    setItems((p) => [...p, { key: nextKey(), text: own.trim(), sourceId: null, sourceTitle: null }]);
    setOwn('');
  };
  const editItem = (key: string, text: string) => setItems((p) => p.map((i) => (i.key === key ? { ...i, text, aiPolished: false } : i)));
  const removeItem = (key: string) => setItems((p) => p.filter((i) => i.key !== key));

  const polishItem = async (key: string) => {
    const it = items.find((i) => i.key === key); if (!it || !it.text.trim()) return;
    setItems((p) => p.map((i) => (i.key === key ? { ...i, polishing: true } : i)));
    try {
      const { data, error } = await supabase.functions.invoke('polish-note', {
        body: { text: it.text, context: 'Rewrite as a clear, encouraging one-sentence weekly focus that a lead dental assistant will carry into their location. Keep it concrete and in plain words.' },
      });
      if (error) throw error;
      const polished = (data as any)?.polished?.trim();
      setItems((p) => p.map((i) => (i.key === key ? { ...i, text: polished || i.text, polishing: false, aiPolished: !!polished } : i)));
    } catch (e: any) {
      setItems((p) => p.map((i) => (i.key === key ? { ...i, polishing: false } : i)));
      toast({ title: "Couldn't polish that", description: e?.message ?? 'Try again.', variant: 'destructive' });
    }
  };

  const schedule = () => {
    if (!items.length) { toast({ title: 'Add at least one focus first' }); return; }
    publishWeek.mutate(
      { weekStart: selectedMonday, framing, items: items.map((i) => ({ text: i.text.trim(), source_issue_id: i.sourceId })) },
      { onSuccess: () => {
          const live = when === 'current';
          const moved = items.filter((i) => i.sourceId).length;
          closeBuilder();
          toast({ title: `Scheduled for ${fmtShort(selectedMonday)}` + (live ? ' · live on lead homes' : ' · planned ahead') + (moved ? ` · ${moved} issue${moved > 1 ? 's' : ''} → Communicated` : '') });
        } },
    );
  };

  const weekMeetings = meetingsInWeek(meetingsHook.meetings, selectedMonday);
  const focusState = deriveFocusSlotState(selected);
  const meetingState = deriveMeetingSlotState(weekMeetings);

  const weekBlast = blastsHook.blasts.find((b) => b.week_start_date === selectedMonday) ?? null;
  const blastState = deriveBlastSlotState(focusState === 'completed', weekMeetings.length, weekBlast);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Meetings and Focus</h1>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Shield className="h-4 w-4" /> Set the week's focus, run the Lead RDA meeting, and (soon) send doctors a weekly recap. Past weeks are your record.
        </p>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-lg border bg-muted/50 p-1">
          {([['week', 'Week', LayoutList], ['month', 'Month', CalendarDays]] as const).map(([m, label, Icon]) => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold ${viewMode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
        {viewMode === 'week' ? (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedMonday((s) => addDays(s, -7)); setBuilderOpen(false); }}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-[120px] text-center text-sm font-bold">{fmtWeek(selectedMonday)}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedMonday((s) => addDays(s, 7)); setBuilderOpen(false); }}><ChevronRight className="h-4 w-4" /></Button>
            {selectedMonday !== currentMonday && <Button variant="ghost" size="sm" onClick={() => setSelectedMonday(currentMonday)}>This week</Button>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonthAnchor((a) => firstOfMonth(addDays(a, -15)))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-bold">{fmtMonth(monthAnchor)}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonthAnchor((a) => firstOfMonth(addDays(a, 40)))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : viewMode === 'month' ? (
        <div className="space-y-2 rounded-xl border p-3">
          {mondaysInMonth(monthAnchor).map((m) => {
            const w = weeksByDate.get(m); const set = !!w && w.items.length > 0;
            const isCurrent = m === currentMonday; const pastEmpty = m < currentMonday && !set;
            return (
              <button key={m} onClick={() => { setSelectedMonday(m); setViewMode('week'); setBuilderOpen(false); }}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted ${set ? 'bg-background' : 'bg-muted/40'} ${pastEmpty ? 'opacity-50' : ''}`}>
                <span className="text-sm font-semibold">{fmtWeek(m)}{isCurrent && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">this week</span>}</span>
                <span className="text-xs font-semibold text-muted-foreground">{set ? (m < currentMonday ? '✓ covered' : '✓ scheduled') : '◦ not set'}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <SlotSection num={1} title="Focus" state={focusState}>
            {builderOpen ? (
              <Builder weekLabel={fmtWeek(selectedMonday)} when={when} items={items} framing={framing} own={own}
                availIssues={availIssues} publishing={publishWeek.isPending}
                onOwn={setOwn} onAddOwn={addOwn} onAddIssue={addIssue} onEdit={editItem} onRemove={removeItem}
                onPolish={polishItem} onFraming={setFraming} onSchedule={schedule} onCancel={closeBuilder} />
            ) : (
              <SelectedWeek week={selected} when={when} monday={selectedMonday} onBuild={() => openBuilder(selectedMonday)} />
            )}
          </SlotSection>

          <SlotSection num={2} title="Meeting" state={meetingState}>
            <MeetingSlot
              meetings={weekMeetings}
              onRecord={() => setMeetingDialog({ mode: 'create', meeting: null })}
              onOpen={(m) => setMeetingDialog({ mode: 'view', meeting: m })}
            />
          </SlotSection>

          <SlotSection num={3} title="Doctor blast" state={blastSlotBadgeStatus(blastState)}>
            <BlastSlot
              state={blastState}
              weekBlast={weekBlast}
              weekStartDate={selectedMonday}
              blastsHook={blastsHook}
            />
          </SlotSection>
        </div>
      )}

      <RecordAccordion weeks={weeks.filter((w) => w.week_start_date < currentMonday)} />

      {meetingDialog && (
        <RecordMeetingDialog
          open={!!meetingDialog}
          onOpenChange={(o) => { if (!o) setMeetingDialog(null); }}
          mode={meetingDialog.mode}
          meeting={meetingDialog.meeting}
          weekStart={selectedMonday}
          locations={locations}
          creating={meetingsHook.createMeeting.isPending}
          updating={meetingsHook.updateMeeting.isPending}
          onCreate={(input) => meetingsHook.createMeeting.mutate(input, {
            onSuccess: () => toast({ title: 'Meeting saved' }),
          })}
          onUpdateSummary={(input) => meetingsHook.updateMeeting.mutate(input, {
            onSuccess: () => toast({ title: 'Summary saved' }),
          })}
          onAddIssue={(input) => ws.createIssue.mutate(input)}
        />
      )}
    </div>
  );
}

// ── slot chrome ───────────────────────────────────────────────────────────

function SlotSection({ num, title, state, children }: { num: number; title: string; state: BadgeStatus; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid h-6 w-6 flex-none place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{num}</span>
        <h2 className="text-sm font-bold">{title}</h2>
        <StatusBadge status={state} className="ml-auto" />
      </div>
      {children}
    </div>
  );
}

function MeetingSlot({ meetings, onRecord, onOpen }: { meetings: LeadMeetingRow[]; onRecord: () => void; onOpen: (m: LeadMeetingRow) => void }) {
  if (meetings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        <div><Button onClick={onRecord}><Plus className="mr-1.5 h-4 w-4" />Record meeting</Button></div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {meetings.map((m) => (
        <button key={m.id} onClick={() => onOpen(m)}
          className="flex w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-muted/40">
          <Users className="mt-0.5 h-4 w-4 flex-none text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{formatDateForDisplay(m.meeting_date)}</div>
            {m.internal_summary && <div className="mt-0.5 truncate text-xs text-muted-foreground">{m.internal_summary}</div>}
          </div>
        </button>
      ))}
      <Button variant="outline" size="sm" onClick={onRecord}><Plus className="mr-1.5 h-4 w-4" />Record another</Button>
    </div>
  );
}

const fmtSentAt = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function BlastSlot({
  state, weekBlast, weekStartDate, blastsHook,
}: {
  state: BlastSlotState;
  weekBlast: LeadWeekBlastRow | null;
  weekStartDate: string;
  blastsHook: ReturnType<typeof useLeadWeekBlasts>;
}) {
  const [editedBody, setEditedBody] = useState(weekBlast?.body ?? '');
  const [drafting, setDrafting] = useState(false);
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const lastGeneratedRef = useRef('');

  // Re-sync local edit state when a different week's draft loads. Keyed on
  // id + week so it doesn't stomp on in-progress typing when the query
  // silently refetches the same row.
  useEffect(() => {
    setEditedBody(weekBlast?.body ?? '');
    lastGeneratedRef.current = weekBlast?.body ?? '';
  }, [weekBlast?.id, weekStartDate]);

  const runDraft = async () => {
    setDrafting(true);
    try {
      const body = await blastsHook.generateDraft.mutateAsync(weekStartDate);
      lastGeneratedRef.current = body;
      setEditedBody(body);
      if (weekBlast) {
        blastsHook.updateBlastBody.mutate({ id: weekBlast.id, body });
      } else {
        blastsHook.createBlast.mutate({ weekStartDate, body });
      }
    } catch {
      // Failure toast already shown by the hook's onError.
    } finally {
      setDrafting(false);
    }
  };

  const onRegenerateClick = () => {
    if (shouldConfirmRegenerate(editedBody, lastGeneratedRef.current)) {
      setRegenConfirmOpen(true);
    } else {
      runDraft();
    }
  };

  const onSendClick = async () => {
    setCountLoading(true);
    try {
      const count = await blastsHook.fetchRecipientCount.mutateAsync();
      setRecipientCount(count);
      setSendConfirmOpen(true);
    } catch {
      // Failure toast already shown by the hook's onError.
    } finally {
      setCountLoading(false);
    }
  };

  const confirmSend = () => {
    if (!weekBlast) return;
    blastsHook.sendBlast.mutate(weekBlast.id, {
      onSuccess: () => {
        setSendConfirmOpen(false);
        toast({ title: 'Sent to doctors' });
      },
    });
  };

  if (state === 'none' || state === 'draftable') {
    return (
      <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
        <Mail className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <div className="mt-3">
          <Button disabled={state === 'none' || drafting} onClick={runDraft}>
            {drafting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Drafting…</>
            ) : (
              <><Sparkles className="mr-1.5 h-4 w-4" />Draft blast</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  if (state === 'sent' && weekBlast) {
    const count = weekBlast.recipient_count ?? 0;
    return (
      <div className="space-y-2.5">
        <div className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">{weekBlast.body}</div>
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          Sent {weekBlast.sent_at && fmtSentAt(weekBlast.sent_at)} · {count} doctor{count === 1 ? '' : 's'}
        </div>
      </div>
    );
  }

  // state === 'draft'
  return (
    <div className="space-y-3">
      <Textarea value={editedBody} onChange={(e) => setEditedBody(e.target.value)} rows={10} />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!editedBody.trim() || !weekBlast || blastsHook.updateBlastBody.isPending}
          onClick={() => weekBlast && blastsHook.updateBlastBody.mutate({ id: weekBlast.id, body: editedBody })}
        >
          {blastsHook.updateBlastBody.isPending ? (
            <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Saving…</>
          ) : 'Save draft'}
        </Button>
        <Button size="sm" variant="outline" disabled={drafting} onClick={onRegenerateClick}>
          {drafting ? (
            <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Regenerating…</>
          ) : (
            <><Sparkles className="mr-1.5 h-4 w-4" />Regenerate</>
          )}
        </Button>
        <Button size="sm" className="ml-auto" disabled={!editedBody.trim() || !weekBlast || countLoading} onClick={onSendClick}>
          {countLoading ? (
            <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Checking…</>
          ) : (
            <><Mail className="mr-1.5 h-4 w-4" />Send to doctors</>
          )}
        </Button>
      </div>

      <AlertDialog open={regenConfirmOpen} onOpenChange={setRegenConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the current draft?</AlertDialogTitle>
            <AlertDialogDescription>Your edits will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setRegenConfirmOpen(false); runDraft(); }}>Replace</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={sendConfirmOpen} onOpenChange={setSendConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this to all doctors?</AlertDialogTitle>
            <AlertDialogDescription>{buildSendConfirmBody(recipientCount ?? 0)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={blastsHook.sendBlast.isPending} onClick={confirmSend}>
              {blastsHook.sendBlast.isPending ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Sending…</>
              ) : 'Send'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── existing focus slot pieces (unchanged behavior) ─────────────────────────

function SelectedWeek({ week, when, monday, onBuild }: { week: HydratedFocusWeek | null; when: 'past' | 'current' | 'future'; monday: string; onBuild: () => void }) {
  const live = when === 'current';
  if (week && week.items.length > 0) {
    return (
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">{when === 'past' ? 'What you covered' : 'Scheduled'}</span>
          {live && <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[color:var(--domain-clinical,#0E7C86)]">● live on lead homes</span>}
        </div>
        {week.items.map((it, i) => <FocusRow key={it.id} idx={i} text={it.text} outcome={when === 'past' ? it.outcome : undefined} />)}
        {week.framing && <p className="mt-2.5 text-sm italic text-muted-foreground">“{week.framing}”</p>}
        {when !== 'past' && <Button variant="outline" size="sm" className="mt-3" onClick={onBuild}>Edit</Button>}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
      Nothing set for {fmtShort(monday)} yet.
      <div className="mt-3"><Button onClick={onBuild}><Plus className="mr-1.5 h-4 w-4" />{when === 'current' ? "Set this week's focus" : 'Plan this week'}</Button></div>
    </div>
  );
}

function FocusRow({ idx, text, outcome }: { idx: number; text: string; outcome?: string }) {
  return (
    <div className="flex items-start gap-3 border-t py-2.5 first:border-0">
      <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{idx + 1}</span>
      <div className="flex-1">
        <div className="text-sm font-semibold">{text}</div>
        {outcome && <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{OUTCOME_META[outcome as keyof typeof OUTCOME_META]?.label ?? outcome}</span>}
      </div>
    </div>
  );
}

function Builder(props: {
  weekLabel: string; when: 'past' | 'current' | 'future'; items: BuilderItem[]; framing: string; own: string; availIssues: CoachingIssue[]; publishing: boolean;
  onOwn: (v: string) => void; onAddOwn: () => void; onAddIssue: (i: CoachingIssue) => void; onEdit: (k: string, v: string) => void; onRemove: (k: string) => void;
  onPolish: (k: string) => void; onFraming: (v: string) => void; onSchedule: () => void; onCancel: () => void;
}) {
  const { items, availIssues, when } = props;
  const live = when === 'current';
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold">Set focus · {props.weekLabel}</h3>
        <Button variant="ghost" size="sm" onClick={props.onCancel}>Cancel</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-[1.35fr_1fr]">
        {/* left: slots */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">This week (1–2)</span>
            {items.length >= 2 && <span className="text-[10.5px] font-bold text-muted-foreground">Two is the cap</span>}
          </div>
          {[0, 1].map((n) => {
            const it = items[n];
            if (!it) return <div key={n} className="mb-3 rounded-xl border border-dashed p-3.5 text-[12.5px] text-muted-foreground">Add an issue from the right, or write your own.</div>;
            return (
              <div key={it.key} className="mb-3 rounded-xl border p-3">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-muted text-xs font-bold text-muted-foreground">{n + 1}</span>
                  <div className="flex-1">
                    <Textarea value={it.text} onChange={(e) => props.onEdit(it.key, e.target.value)} rows={2} className="font-semibold" />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{it.sourceTitle ? `from: ${it.sourceTitle.slice(0, 24)}${it.sourceTitle.length > 24 ? '…' : ''}` : 'written by you'}</span>
                        {it.aiPolished && <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[color:var(--domain-clinical,#0E7C86)]"><Sparkles className="h-4 w-4" />AI-polished</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" disabled={it.polishing} onClick={() => props.onPolish(it.key)}>
                          {it.polishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="mr-1 h-4 w-4" />Polish</>}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => props.onRemove(it.key)}><X className="h-5 w-5" /></Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="my-4 h-px bg-border" />
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Framing note <span className="font-normal normal-case tracking-normal">(optional)</span></div>
          <Textarea value={props.framing} onChange={(e) => props.onFraming(e.target.value)} rows={2} placeholder="e.g. Two small things this week, both about starting strong with the family." />
          <Button className="mt-3.5" disabled={props.publishing || !items.length} onClick={props.onSchedule}>
            {props.publishing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scheduling…</> : 'Schedule this week →'}
          </Button>
          <p className="mt-2.5 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {live ? 'Pushes to the lead homes and moves' : 'Saves to this week and moves'} the sourcing issues to <span className="font-semibold text-[color:var(--domain-clinical,#0E7C86)]">Communicated</span>.
          </p>
        </div>
        {/* right: issues menu */}
        <div className="self-start rounded-xl border p-3.5">
          <h3 className="text-sm font-bold">Pull from your issues</h3>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">Click <b>+ Focus</b> to promote one. Declaring moves it to Communicated.</p>
          <div className="mb-3.5 flex gap-2">
            <Input value={props.own} onChange={(e) => props.onOwn(e.target.value)} placeholder="Or write your own…" onKeyDown={(e) => { if (e.key === 'Enter') props.onAddOwn(); }} />
            <Button variant="outline" size="sm" onClick={props.onAddOwn}>Add</Button>
          </div>
          {availIssues.length === 0 ? (
            <div className="rounded-lg border border-dashed py-6 text-center text-xs text-muted-foreground">No open issues to pull.</div>
          ) : availIssues.map((iss) => (
            <div key={iss.id} className="mb-2.5 rounded-lg border p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 text-[13.5px] font-semibold">{iss.title}</div>
                <Button size="sm" disabled={items.length >= 2} onClick={() => props.onAddIssue(iss)}><Plus className="mr-1 h-4 w-4" />Focus</Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {iss.is_global && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Global</span>}
                {iss.sources.map((s: SourceType) => <span key={s} className="rounded-full border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{SOURCE_META[s].label}</span>)}
                {iss.sources.length >= 2 && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs font-bold text-primary">×{iss.sources.length}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RecordAccordion({ weeks }: { weeks: HydratedFocusWeek[] }) {
  const groups = useMemo(() => {
    const sorted = weeks.slice().sort((a, b) => b.week_start_date.localeCompare(a.week_start_date));
    const g: { month: string; weeks: HydratedFocusWeek[] }[] = [];
    sorted.forEach((w) => { const m = fmtMonth(w.week_start_date); let e = g.find((x) => x.month === m); if (!e) { e = { month: m, weeks: [] }; g.push(e); } e.weeks.push(w); });
    return g;
  }, [weeks]);

  return (
    <div className="pt-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Record: what you have covered</span>
        <span className="text-xs text-muted-foreground">outcomes fill in as you assess the issues</span>
      </div>
      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">No past weeks yet.</div>
      ) : groups.map((g) => (
        <div key={g.month} className="mt-2">
          <div className="px-1 py-2 text-xs font-bold text-muted-foreground">{g.month}</div>
          <Accordion type="multiple" className="border-t">
            {g.weeks.map((w) => (
              <AccordionItem key={w.id} value={w.id}>
                <AccordionTrigger className="text-[13.5px]">
                  <span className="flex items-center gap-2">{fmtWeek(w.week_start_date)}<span className="text-xs font-normal text-muted-foreground">· {w.items.length} focus{w.items.length !== 1 ? 'es' : ''}</span></span>
                </AccordionTrigger>
                <AccordionContent>
                  {w.items.map((it, i) => <FocusRow key={it.id} idx={i} text={it.text} outcome={it.outcome} />)}
                  {w.framing && <p className="mt-2 text-sm italic text-muted-foreground">“{w.framing}”</p>}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ))}
    </div>
  );
}
