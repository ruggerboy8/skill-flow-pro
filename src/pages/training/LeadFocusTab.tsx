import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLeadFocus } from '@/hooks/useLeadFocus';
import { useCoachingWorkspace } from '@/hooks/useCoachingWorkspace';
import { SOURCE_META, type SourceType, type CoachingIssue } from '@/types/coachingWorkspace';
import { OUTCOME_META, type HydratedFocusWeek } from '@/types/leadFocus';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { toast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, LayoutList, CalendarDays, Sparkles, Loader2, Plus, X, Shield } from 'lucide-react';

// ── date helpers (local; Monday-keyed like the planner) ──────────────────────
const parse = (s: string) => new Date(s + 'T12:00:00');
const fmtShort = (s: string) => parse(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtWeek = (s: string) => 'Week of ' + fmtShort(s);
const fmtMonth = (s: string) => parse(s).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]; };
const firstOfMonth = (s: string) => { const d = parse(s); return new Date(d.getFullYear(), d.getMonth(), 1, 12).toISOString().split('T')[0]; };
function mondaysInMonth(anchor: string): string[] {
  const d = parse(anchor); const month = d.getMonth();
  const cur = new Date(d.getFullYear(), month, 1, 12);
  while (cur.getDay() !== 1) cur.setDate(cur.getDate() + 1);
  const out: string[] = [];
  while (cur.getMonth() === month) { out.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 7); }
  return out;
}

interface BuilderItem { key: string; text: string; sourceId: string | null; sourceTitle: string | null; polishing?: boolean; aiPolished?: boolean }

export function LeadFocusTab() {
  const { weeks, currentMonday, publishWeek, isLoading } = useLeadFocus();
  const ws = useCoachingWorkspace();
  const weeksByDate = useMemo(() => new Map(weeks.map((w) => [w.week_start_date, w])), [weeks]);

  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedMonday, setSelectedMonday] = useState(currentMonday);
  const [monthAnchor, setMonthAnchor] = useState(firstOfMonth(currentMonday));

  // builder
  const [builderOpen, setBuilderOpen] = useState(false);
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [framing, setFraming] = useState('');
  const [own, setOwn] = useState('');
  const keyRef = useRef(1);
  const nextKey = () => 'k' + (keyRef.current++);

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Lead focus schedule</h1>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Shield className="h-3.5 w-3.5" /> One or two behaviors you want the leads driving at their locations each week. Move across weeks like the builder; past weeks are your record.
        </p>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex gap-1 rounded-lg border bg-muted/50 p-1">
          {([['week', 'Week', LayoutList], ['month', 'Month', CalendarDays]] as const).map(([m, label, Icon]) => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold ${viewMode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
              <Icon className="h-3.5 w-3.5" />{label}
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
      ) : builderOpen ? (
        <Builder weekLabel={fmtWeek(selectedMonday)} when={when} items={items} framing={framing} own={own}
          availIssues={availIssues} publishing={publishWeek.isPending}
          onOwn={setOwn} onAddOwn={addOwn} onAddIssue={addIssue} onEdit={editItem} onRemove={removeItem}
          onPolish={polishItem} onFraming={setFraming} onSchedule={schedule} onCancel={closeBuilder} />
      ) : (
        <SelectedWeek week={selected} when={when} monday={selectedMonday} onBuild={() => openBuilder(selectedMonday)} />
      )}

      <RecordAccordion weeks={weeks.filter((w) => w.week_start_date < currentMonday)} />
    </div>
  );
}

function SelectedWeek({ week, when, monday, onBuild }: { week: HydratedFocusWeek | null; when: 'past' | 'current' | 'future'; monday: string; onBuild: () => void }) {
  const live = when === 'current';
  if (week && week.items.length > 0) {
    return (
      <div className="rounded-xl border p-4">
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
    <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
      Nothing set for {fmtShort(monday)} yet.
      <div className="mt-3"><Button onClick={onBuild}><Plus className="mr-1.5 h-4 w-4" />{when === 'current' ? "Set this week's focus" : 'Plan this week'}</Button></div>
    </div>
  );
}

function FocusRow({ idx, text, outcome }: { idx: number; text: string; outcome?: string }) {
  return (
    <div className="flex items-start gap-3 border-t py-2.5 first:border-0">
      <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground">{idx + 1}</span>
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
    <div className="rounded-xl border p-4">
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
                  <span className="mt-0.5 grid h-[22px] w-[22px] flex-none place-items-center rounded-full bg-muted text-[12px] font-bold text-muted-foreground">{n + 1}</span>
                  <div className="flex-1">
                    <Textarea value={it.text} onChange={(e) => props.onEdit(it.key, e.target.value)} rows={2} className="font-semibold" />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{it.sourceTitle ? `from: ${it.sourceTitle.slice(0, 24)}${it.sourceTitle.length > 24 ? '…' : ''}` : 'written by you'}</span>
                        {it.aiPolished && <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[color:var(--domain-clinical,#0E7C86)]"><Sparkles className="h-3 w-3" />AI-polished</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" disabled={it.polishing} onClick={() => props.onPolish(it.key)}>
                          {it.polishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Sparkles className="mr-1 h-3.5 w-3.5" />Polish</>}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => props.onRemove(it.key)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="my-4 h-px bg-border" />
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Framing note <span className="font-normal normal-case tracking-normal">— optional</span></div>
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
                <Button size="sm" disabled={items.length >= 2} onClick={() => props.onAddIssue(iss)}><Plus className="mr-1 h-3.5 w-3.5" />Focus</Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {iss.is_global && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">Global</span>}
                {iss.sources.map((s: SourceType) => <span key={s} className="rounded-full border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{SOURCE_META[s].label}</span>)}
                {iss.sources.length >= 2 && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">×{iss.sources.length}</span>}
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
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Record — what you have covered</span>
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
