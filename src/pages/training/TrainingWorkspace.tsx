import { useMemo, useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCoachingWorkspace, fetchIssueEvents } from '@/hooks/useCoachingWorkspace';
import {
  STAGE_META, STAGE_ORDER, OUTCOME_META, SOURCE_META,
  type CoachingIssue, type IssueStage, type RetireOutcome, type SourceType,
} from '@/types/coachingWorkspace';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import {
  Plus, LayoutList, KanbanSquare, MapPin, Archive, Eye, Stethoscope, Users, Activity,
  ArrowRight, X, Shield,
} from 'lucide-react';

// Subtle stage colors (a not-yet-tokenized concept; fine to hardcode for now).
const STAGE_HEX: Record<IssueStage, string> = {
  identified: '#8497A6', communicated: '#0E7C86', assessed: '#C77D18',
};
const SOURCE_ICON: Record<SourceType, any> = { visit: Eye, doctor: Stethoscope, leads: Users, signal: Activity };

interface Loc { id: string; name: string; group: string }

function useLocations() {
  return useQuery({
    queryKey: ['workspace-locations'],
    queryFn: async (): Promise<Loc[]> => {
      const [locs, groups] = await Promise.all([
        supabase.from('locations').select('id, name, group_id').eq('active', true).order('name'),
        supabase.from('practice_groups').select('id, name'),
      ]);
      const gmap = new Map((groups.data ?? []).map((g: any) => [g.id, g.name]));
      return (locs.data ?? []).map((l: any) => ({ id: l.id, name: l.name, group: gmap.get(l.group_id) ?? '' }));
    },
  });
}

function StagePill({ stage }: { stage: IssueStage }) {
  const c = STAGE_HEX[stage];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
      {STAGE_META[stage].label}
    </span>
  );
}

function LocChips({ issue, locMap, max = 3 }: { issue: CoachingIssue; locMap: Map<string, Loc>; max?: number }) {
  const chips: string[] = issue.is_global ? ['Global'] : issue.locationIds.map((id) => locMap.get(id)?.name ?? '…');
  const shown = chips.slice(0, max);
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((n, i) => (
        <span key={i} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${n === 'Global' ? 'border-transparent bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{n}</span>
      ))}
      {chips.length > max && <span className="text-[11px] text-muted-foreground">+{chips.length - max}</span>}
    </div>
  );
}

function SourceBadges({ sources }: { sources: SourceType[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {sources.map((s) => {
        const Icon = SOURCE_ICON[s];
        return <span key={s} title={SOURCE_META[s].label} className="inline-flex items-center rounded-full border bg-muted px-1.5 py-0.5 text-muted-foreground"><Icon className="h-3 w-3" /></span>;
      })}
      {sources.length >= 2 && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">×{sources.length}</span>}
    </div>
  );
}

export default function TrainingWorkspace() {
  const ws = useCoachingWorkspace();
  const { data: locations = [] } = useLocations();
  const locMap = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const [mode, setMode] = useState<'list' | 'board' | 'loc'>('list');
  const [drawer, setDrawer] = useState<CoachingIssue | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [retireFor, setRetireFor] = useState<CoachingIssue | null>(null);

  // keep the open drawer issue in sync with fresh data
  useEffect(() => {
    if (drawer) {
      const fresh = ws.issues.find((i) => i.id === drawer.id);
      if (fresh && fresh !== drawer) setDrawer(fresh);
    }
  }, [ws.issues]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Your Workspace</h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" /> Private to you. Collect what you see, work it through the loop, close it out.
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setHistOpen(true)}><Archive className="mr-2 h-4 w-4" />History ({ws.archived.length})</Button>
          <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="mr-2 h-4 w-4" />Add issue</Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="inline-flex gap-1 rounded-lg border bg-muted/50 p-1">
          {([['list', 'List', LayoutList], ['board', 'Board', KanbanSquare], ['loc', 'By location', MapPin]] as const).map(([m, label, Icon]) => (
            <button key={m} onClick={() => setMode(m)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold ${mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      {ws.isLoading ? (
        <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : ws.issues.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">
          Nothing here yet. Add the first thing you've noticed.
        </div>
      ) : mode === 'list' ? (
        <ListView issues={ws.issues} locMap={locMap} onOpen={setDrawer} />
      ) : mode === 'board' ? (
        <BoardView issues={ws.issues} locMap={locMap} onOpen={setDrawer}
          onMove={(id, stage) => ws.setStage.mutate({ id, stage })} />
      ) : (
        <ByLocationView issues={ws.issues} locations={locations} onOpen={setDrawer} />
      )}

      <IssueDrawer issue={drawer} locMap={locMap} ws={ws} onClose={() => setDrawer(null)} onRetire={(i) => setRetireFor(i)} />
      <AddIssueDialog open={addOpen} onOpenChange={setAddOpen} locations={locations}
        onSave={(input) => ws.createIssue.mutate(input, { onSuccess: () => { setAddOpen(false); toast({ title: 'Added to your workspace' }); } })} />
      <RetireDialog issue={retireFor} onClose={() => setRetireFor(null)}
        onRetire={(id, outcome, note) => ws.retire.mutate({ id, outcome, note }, { onSuccess: () => { setRetireFor(null); setDrawer(null); toast({ title: 'Retired to history' }); } })} />
      <HistoryDialog open={histOpen} onOpenChange={setHistOpen} archived={ws.archived} locMap={locMap}
        onReopen={(id) => ws.reopen.mutate(id, { onSuccess: () => toast({ title: 'Reopened' }) })} />
    </div>
  );
}

function ListView({ issues, locMap, onOpen }: { issues: CoachingIssue[]; locMap: Map<string, Loc>; onOpen: (i: CoachingIssue) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="grid grid-cols-[1fr_180px_120px_130px] gap-3 border-b bg-muted/40 px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Issue</span><span>Location(s)</span><span>Sources</span><span>Next step</span>
      </div>
      {issues.map((i) => (
        <button key={i.id} onClick={() => onOpen(i)} className="grid w-full grid-cols-[1fr_180px_120px_130px] items-start gap-3 border-b px-4 py-3 text-left last:border-0 hover:bg-muted/40">
          <div className="min-w-0"><div className="text-sm font-semibold">{i.title}</div>{i.detail && <div className="truncate text-xs text-muted-foreground">{i.detail}</div>}</div>
          <LocChips issue={i} locMap={locMap} />
          <SourceBadges sources={i.sources} />
          <div><StagePill stage={i.stage} /></div>
        </button>
      ))}
    </div>
  );
}

function BoardView({ issues, locMap, onOpen, onMove }: { issues: CoachingIssue[]; locMap: Map<string, Loc>; onOpen: (i: CoachingIssue) => void; onMove: (id: string, stage: IssueStage) => void }) {
  const [over, setOver] = useState<IssueStage | null>(null);
  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">Each column is the next thing to do. Drag a card right when you've done it — or use the stepper inside an issue.</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {STAGE_ORDER.map((st) => {
          const items = issues.filter((i) => i.stage === st);
          return (
            <div key={st}
              onDragOver={(e) => { e.preventDefault(); setOver(st); }}
              onDragLeave={() => setOver((o) => (o === st ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text'); const it = issues.find((x) => x.id === id); if (it && it.stage !== st) onMove(id, st); }}
              className={`rounded-xl border bg-muted/30 ${over === st ? 'outline-2 outline-dashed outline-primary' : ''}`}>
              <div className="flex items-center gap-2 px-3 pt-3">
                <span className="h-2 w-2 rounded-full" style={{ background: STAGE_HEX[st] }} />
                <span className="text-[13px] font-bold">{STAGE_META[st].label}</span>
                <span className="ml-auto rounded-full border bg-background px-1.5 text-[11px] font-semibold text-muted-foreground">{items.length}</span>
              </div>
              <div className="border-b px-3 pb-2.5 pt-0.5 text-[11px] text-muted-foreground">{STAGE_META[st].hint}</div>
              <div className="flex min-h-[60px] flex-col gap-2 p-2.5">
                {items.length === 0 && <div className="py-3 text-center text-xs text-muted-foreground">Drop issues here</div>}
                {items.map((i) => (
                  <div key={i.id} draggable onDragStart={(e) => e.dataTransfer.setData('text', i.id)} onClick={() => onOpen(i)}
                    className="cursor-grab rounded-lg border bg-background p-2.5 hover:border-border/80 active:cursor-grabbing">
                    <div className="mb-1.5 text-[13px] font-semibold">{i.title}</div>
                    <div className="flex items-center gap-1.5"><LocChips issue={i} locMap={locMap} max={1} /><SourceBadges sources={i.sources} /></div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ByLocationView({ issues, locations, onOpen }: { issues: CoachingIssue[]; locations: Loc[]; onOpen: (i: CoachingIssue) => void }) {
  const locMap = new Map(locations.map((l) => [l.id, l]));
  const globals = issues.filter((i) => i.is_global);
  const byLoc = new Map<string, CoachingIssue[]>();
  issues.forEach((i) => { if (i.is_global) return; i.locationIds.forEach((id) => { const n = locMap.get(id)?.name ?? 'Unknown'; (byLoc.get(n) ?? byLoc.set(n, []).get(n)!).push(i); }); });
  const groups: { name: string; meta: string; items: CoachingIssue[] }[] = [];
  if (globals.length) groups.push({ name: 'Global / cross-location', meta: 'Applies everywhere', items: globals });
  Array.from(byLoc.keys()).sort().forEach((n) => groups.push({ name: n, meta: locations.find((l) => l.name === n)?.group ?? '', items: byLoc.get(n)! }));
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.name} className="overflow-hidden rounded-xl border">
          <div className="flex items-center gap-2.5 border-b bg-muted/40 px-4 py-2.5">
            <span className="text-sm font-bold">{g.name}</span><span className="text-xs text-muted-foreground">{g.meta}</span>
            <span className="ml-auto rounded-full border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">{g.items.length}</span>
          </div>
          {g.items.map((i) => (
            <button key={i.id + g.name} onClick={() => onOpen(i)} className="flex w-full items-center gap-2.5 border-b px-4 py-2.5 text-left last:border-0 hover:bg-muted/40">
              <span className="flex-1 text-sm font-medium">{i.title}</span><StagePill stage={i.stage} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function IssueDrawer({ issue, locMap, ws, onClose, onRetire }: { issue: CoachingIssue | null; locMap: Map<string, Loc>; ws: ReturnType<typeof useCoachingWorkspace>; onClose: () => void; onRetire: (i: CoachingIssue) => void }) {
  const [note, setNote] = useState('');
  const [priv, setPriv] = useState('');
  useEffect(() => { setNote(''); setPriv(issue?.private_note ?? ''); }, [issue?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const events = useQuery({ queryKey: ['issue-events', issue?.id], enabled: !!issue, queryFn: () => fetchIssueEvents(issue!.id) });

  return (
    <Sheet open={!!issue} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[452px]">
        {issue && (
          <div className="space-y-4 pt-2">
            <div><StagePill stage={issue.stage} /><h2 className="mt-2 text-lg font-semibold leading-snug">{issue.title}</h2></div>

            <div>
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Next step</div>
              <div className="inline-flex w-full gap-1 rounded-lg border bg-muted/50 p-1">
                {STAGE_ORDER.map((s) => (
                  <button key={s} onClick={() => ws.setStage.mutate({ id: issue.id, stage: s })}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-semibold ${issue.stage === s ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
                    {STAGE_META[s].label}
                  </button>
                ))}
              </div>
            </div>

            {issue.detail && <div><div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Detail</div><p className="text-sm text-muted-foreground">{issue.detail}</p></div>}

            <div><div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Location(s)</div><LocChips issue={issue} locMap={locMap} max={99} /></div>
            <div><div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Where it came from</div><SourceBadges sources={issue.sources} /></div>

            <div>
              <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">History</div>
              <div className="space-y-2 border-l-2 pl-3.5">
                {(events.data ?? []).map((e) => (
                  <div key={e.id} className="relative text-[13px]">
                    <span className="absolute -left-[19px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <span className="text-[11px] font-semibold text-muted-foreground">{new Date(e.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    <span className="ml-2">{e.body}</span>
                  </div>
                ))}
                {(events.data ?? []).length === 0 && <div className="text-xs text-muted-foreground">Just added.</div>}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Add a follow-up note</div>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Checked at McKinney — notes now starting at intake, looks solid." />
              <Button variant="outline" size="sm" className="mt-2" disabled={!note.trim()}
                onClick={() => ws.addNote.mutate({ id: issue.id, body: note.trim() }, { onSuccess: () => { setNote(''); events.refetch(); } })}>Add to history</Button>
            </div>

            <div>
              <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">Note to self <span className="font-normal normal-case tracking-normal">— private, never shown to staff</span></div>
              <Textarea value={priv} onChange={(e) => setPriv(e.target.value)} onBlur={() => { if (priv !== (issue.private_note ?? '')) ws.setPrivateNote.mutate({ id: issue.id, note: priv }); }} rows={2} placeholder="Anything just for you…" />
            </div>

            <Separator />
            <div className="flex gap-2 pb-2">
              <Button variant="destructive" className="flex-1" onClick={() => onRetire(issue)}>Retire…</Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AddIssueDialog({ open, onOpenChange, locations, onSave }: { open: boolean; onOpenChange: (o: boolean) => void; locations: Loc[]; onSave: (input: { title: string; detail?: string; isGlobal: boolean; locationIds: string[]; sources: SourceType[] }) => void }) {
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [isGlobal, setIsGlobal] = useState(false);
  const [locs, setLocs] = useState<Set<string>>(new Set());
  const [srcs, setSrcs] = useState<Set<SourceType>>(new Set());
  useEffect(() => { if (open) { setTitle(''); setDetail(''); setIsGlobal(false); setLocs(new Set()); setSrcs(new Set()); } }, [open]);
  const toggle = <T,>(set: Set<T>, v: T, upd: (s: Set<T>) => void) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); upd(n); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[540px]">
        <DialogHeader><DialogTitle>Add an issue</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><label className="mb-1.5 block text-[12.5px] font-semibold text-foreground/80">What did you notice?</label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Notes should start at height & weight" autoFocus /></div>
          <div><label className="mb-1.5 block text-[12.5px] font-semibold text-foreground/80">Detail <span className="font-normal text-muted-foreground">(optional)</span></label><Textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} placeholder="A sentence or two of context…" /></div>
          <div>
            <div className="mb-1.5 flex items-center justify-between"><label className="text-[12.5px] font-semibold text-foreground/80">Location(s)</label><label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={isGlobal} onCheckedChange={setIsGlobal} />Global / cross-location</label></div>
            {!isGlobal && (
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded-lg border p-2">
                {locations.map((l) => (
                  <button key={l.id} type="button" onClick={() => toggle(locs, l.id, setLocs)}
                    className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold ${locs.has(l.id) ? 'border-transparent bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{l.name}</button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-[12.5px] font-semibold text-foreground/80">Where's it from?</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(SOURCE_META) as SourceType[]).map((s) => (
                <button key={s} type="button" onClick={() => toggle(srcs, s, setSrcs)}
                  className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${srcs.has(s) ? 'border-transparent bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{SOURCE_META[s].label}</button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!title.trim()} onClick={() => onSave({ title: title.trim(), detail: detail.trim() || undefined, isGlobal, locationIds: isGlobal ? [] : Array.from(locs), sources: Array.from(srcs) })}>Save to workspace</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RetireDialog({ issue, onClose, onRetire }: { issue: CoachingIssue | null; onClose: () => void; onRetire: (id: string, outcome: RetireOutcome, note?: string) => void }) {
  const [outcome, setOutcome] = useState<RetireOutcome | null>(null);
  const [note, setNote] = useState('');
  useEffect(() => { if (issue) { setOutcome(null); setNote(''); } }, [issue]);
  return (
    <Dialog open={!!issue} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle>Retire this issue</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">“{issue?.title}”</p>
          <div>
            <label className="mb-1.5 block text-[12.5px] font-semibold text-foreground/80">How did it end?</label>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(OUTCOME_META) as RetireOutcome[]).map((o) => (
                <button key={o} type="button" onClick={() => setOutcome(o)}
                  className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold ${outcome === o ? 'border-transparent bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{OUTCOME_META[o].label}</button>
              ))}
            </div>
          </div>
          <div><label className="mb-1.5 block text-[12.5px] font-semibold text-foreground/80">Closing note <span className="font-normal text-muted-foreground">(optional)</span></label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What happened?" /></div>
          <p className="text-xs text-muted-foreground">It moves to History — nothing is deleted, and you can reopen it later.</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!outcome} onClick={() => issue && outcome && onRetire(issue.id, outcome, note.trim() || undefined)}>Retire to history</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ open, onOpenChange, archived, locMap, onReopen }: { open: boolean; onOpenChange: (o: boolean) => void; archived: CoachingIssue[]; locMap: Map<string, Loc>; onReopen: (id: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader><DialogTitle>History</DialogTitle></DialogHeader>
        <p className="-mt-1 text-xs text-muted-foreground">Retired issues, and how they ended. This is your record when there's no KPI.</p>
        <div>
          {archived.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">Nothing retired yet.</div> : archived.map((a) => {
            const where = a.is_global ? 'Global' : a.locationIds.map((id) => locMap.get(id)?.name ?? '…').join(', ');
            return (
              <div key={a.id} className="flex items-center gap-3 border-b py-3 last:border-0">
                <div className="flex-1">
                  <div className="text-[13.5px] font-semibold">{a.title}</div>
                  <div className="text-xs text-muted-foreground">{where} · retired {a.retired_at ? new Date(a.retired_at).toLocaleDateString() : ''}{a.retired_note ? ` · ${a.retired_note}` : ''}</div>
                </div>
                {a.retired_outcome && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{OUTCOME_META[a.retired_outcome].label}</span>}
                <Button variant="ghost" size="sm" onClick={() => onReopen(a.id)}>Reopen</Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
