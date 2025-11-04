import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Save, RotateCcw, RefreshCw } from 'lucide-react';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DOMAIN_META, DRIVER_LABELS } from '@/lib/constants/domains';
import { formatMmDdYyyy } from '@/v2/time';

type RoleId = 1 | 2; // 1=DFI, 2=RDA

type Pick = {
  proMoveId: number;
  name: string;
  domainId: number;
  finalScore: number;
  drivers: Array<'C'|'R'|'E'|'D'|'M'>;
};

type WeekPlan = {
  weekStart: string; // YYYY-MM-DD
  picks: Pick[];
};

type RankingsResponse = {
  timezone: string;
  thisWeek: WeekPlan;
  nextWeek: WeekPlan;
  ranked: Pick[];
};

type RankItem = Pick;

// Sortable item
function SortableRow({ item, index, isPriorityZone }: { item: RankItem; index: number; isPriorityZone: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.proMoveId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const domain = DOMAIN_META[item.domainId];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between border rounded-lg p-3 mb-2 bg-card ${isPriorityZone ? 'ring-2 ring-amber-400/60' : ''}`}
      aria-roledescription="Draggable item"
    >
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
          className="cursor-grab active:cursor-grabbing select-none px-2 py-1 rounded border text-xs text-muted-foreground hover:bg-muted/50"
          title="Drag to reorder"
        >
          ⠿
        </button>
        <div>
          <div className="font-medium text-sm">{index + 1}. {item.name}</div>
          <div className="flex gap-1 mt-1 flex-wrap">
            <Badge variant="outline" className={`text-[10px] py-0 ${domain?.chipClass ?? ''}`}>
              {domain?.name ?? `Domain ${item.domainId}`}
            </Badge>
            {item.drivers.map((d) => (
              <Badge key={d} variant="outline" className={`text-[10px] py-0 ${DRIVER_LABELS[d].color}`}>
                {DRIVER_LABELS[d].label}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <Badge variant="secondary" className="font-mono text-xs">{item.finalScore.toFixed(2)}</Badge>
    </div>
  );
}

export function WeeklyProMovesTab() {
  const [role, setRole] = useState<RoleId>(2); // default RDA
  const [sim, setSim] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<RankingsResponse | null>(null);
  const [ordered, setOrdered] = useState<RankItem[]>([]);
  const [dirty, setDirty] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const priorityCount = 5;

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sequencer-alcan-rankings', {
        body: { roleId: role, simulation: sim }
      });
      if (error) throw error;
      const resp = data as RankingsResponse;
      setData(resp);
      setOrdered(resp.ranked);
      setDirty(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to load rankings', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [role, sim]);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = ordered.findIndex(i => i.proMoveId === active.id);
    const newIndex = ordered.findIndex(i => i.proMoveId === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(ordered, oldIndex, newIndex);
    setOrdered(next);
    setDirty(true);
  }

  async function onSave() {
    try {
      setSaving(true);
      const actionIds = ordered.map(i => i.proMoveId);
      const { error } = await supabase.functions.invoke('manager-priorities-save', {
        body: { roleId: role, actionIds, simulation: sim }
      });
      if (error) throw error;
      toast({ title: 'Saved', description: `Priorities ${sim ? '(simulation)' : ''} updated. Refreshing preview…` });

      await load();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Unable to save priorities', variant: 'destructive' });
    } finally {
      setSaving(false);
      setDirty(false);
    }
  }

  function onRevert() {
    if (!data) return;
    setOrdered(data.ranked);
    setDirty(false);
  }

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Card><CardHeader><CardTitle>Weekly Pro Moves</CardTitle></CardHeader><CardContent className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading…</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-semibold">Weekly Pro Moves</h2>
            {sim && <Badge variant="destructive" className="text-xs">SIM</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            This Week is locked. Your Top&nbsp;5 priorities influence <strong>Next Week</strong> only.
          </p>
          {sim && (
            <div className="text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded px-2 py-1 inline-block">
              Simulation Mode — sandboxed inputs &amp; priorities
            </div>
          )}
        </div>
        <div className="flex flex-col gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 justify-end">
            <Label className="text-xs">Simulation Mode</Label>
            <Switch checked={sim} onCheckedChange={setSim} />
          </div>
          <div className="w-full sm:w-56">
            <Label>Role</Label>
            <Select value={String(role)} onValueChange={(v) => setRole(Number(v) as RoleId)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">DFI</SelectItem>
                <SelectItem value="2">RDA</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>This Week (Locked)</CardTitle>
              <CardDescription>Week of {formatMmDdYyyy(data.thisWeek.weekStart, data.timezone)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.thisWeek.picks.map((p, i) => {
                const domain = DOMAIN_META[p.domainId];
                return (
                  <div key={p.proMoveId} className="border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{i + 1}. {p.name}</div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] py-0 ${domain?.chipClass ?? ''}`}>
                          {domain?.name ?? `Domain ${p.domainId}`}
                        </Badge>
                        {p.drivers.map(d => (
                          <Badge key={d} variant="outline" className={`text-[10px] py-0 ${DRIVER_LABELS[d].color}`}>
                            {DRIVER_LABELS[d].label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Badge variant="secondary" className="font-mono text-xs">{p.finalScore.toFixed(2)}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Next Week (Preview)</CardTitle>
              <CardDescription>Week of {formatMmDdYyyy(data.nextWeek.weekStart, data.timezone)}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.nextWeek.picks.map((p, i) => {
                const domain = DOMAIN_META[p.domainId];
                return (
                  <div key={p.proMoveId} className="border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{i + 1}. {p.name}</div>
                      <div className="flex gap-1 mt-1 flex-wrap">
                        <Badge variant="outline" className={`text-[10px] py-0 ${domain?.chipClass ?? ''}`}>
                          {domain?.name ?? `Domain ${p.domainId}`}
                        </Badge>
                        {p.drivers.map(d => (
                          <Badge key={d} variant="outline" className={`text-[10px] py-0 ${DRIVER_LABELS[d].color}`}>
                            {DRIVER_LABELS[d].label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Badge variant="secondary" className="font-mono text-xs">{p.finalScore.toFixed(2)}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Draggable priorities */}
      <Card>
        <CardHeader>
          <CardTitle>Rank Remaining Pro Moves (Top 5 = Priority)</CardTitle>
          <CardDescription>Drag to reorder. Saving updates Next Week only.</CardDescription>
        </CardHeader>
        <CardContent>
          {!data ? (
            <div className="text-sm text-muted-foreground">No data.</div>
          ) : (
            <>
              <div className="mb-3 p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded text-xs">
                <span className="font-medium text-amber-900 dark:text-amber-100">Priority zone:</span>
                <span className="ml-2 text-amber-700 dark:text-amber-300">Top 5 rows</span>
              </div>

              <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                <SortableContext
                  items={ordered.map(i => i.proMoveId)}
                  strategy={verticalListSortingStrategy}
                >
                  {ordered.map((item, idx) => (
                    <SortableRow
                      key={item.proMoveId}
                      item={item}
                      index={idx}
                      isPriorityZone={idx < priorityCount}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              <div className="mt-4 flex gap-2">
                <Button onClick={onSave} disabled={!dirty || saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
                <Button variant="outline" onClick={onRevert} disabled={!dirty}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Revert
                </Button>
                <Button variant="ghost" onClick={() => load()} disabled={loading}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
