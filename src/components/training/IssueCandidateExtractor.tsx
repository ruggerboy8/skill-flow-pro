import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { WorkspaceLocation } from '@/hooks/useWorkspaceLocations';
import type { NewIssueInput } from '@/hooks/useCoachingWorkspace';
import type { SourceType } from '@/types/coachingWorkspace';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { Loader2, Sparkles, Check } from 'lucide-react';

// The keep/drop candidate-issue flow, extracted from the former standalone
// IngestDialog (TrainingWorkspace.tsx) so the "Meetings and Focus" meeting
// dialog (LRM-1) can reuse the same coaching-extract-issues code path instead
// of duplicating it. This component owns extraction + candidate review; the
// caller owns the transcript textarea itself, since in the meeting dialog
// that textarea is shared with the internal-summary generation.

interface IngestCand { title: string; detail: string; selected: boolean; locationIds: Set<string>; isGlobal: boolean }

interface Props {
  /** The already-pasted transcript to extract from. */
  transcript: string;
  locations: WorkspaceLocation[];
  onAdd: (input: NewIssueInput) => void;
  /** Called once, after "Add selected", with how many issues were added. */
  onDone?: (n: number) => void;
  /** Bump this to auto-run extraction (e.g. alongside summary generation). */
  runTrigger?: number;
}

export function IssueCandidateExtractor({ transcript, locations, onAdd, onDone, runTrigger }: Props) {
  const [loading, setLoading] = useState(false);
  const [cands, setCands] = useState<IngestCand[] | null>(null);
  const bump = () => setCands((prev) => (prev ? [...prev] : prev));

  const run = async () => {
    if (transcript.trim().length < 20) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('coaching-extract-issues', {
        body: { transcript, locationNames: locations.map((l) => l.name) },
      });
      if (error) throw error;
      const nameToId = new Map(locations.map((l) => [l.name.toLowerCase(), l.id]));
      const cs: IngestCand[] = (((data as any)?.issues ?? []) as any[]).map((iss) => ({
        title: iss.title, detail: iss.detail ?? '', selected: true,
        locationIds: new Set<string>(((iss.suggested_locations ?? []) as string[]).map((n) => nameToId.get(n.toLowerCase())).filter(Boolean) as string[]),
        isGlobal: false,
      }));
      setCands(cs);
    } catch (e: any) {
      toast({ title: "Couldn't find issues in that transcript", description: e?.message ?? 'Try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Auto-run when the caller bumps runTrigger (the meeting dialog's single
  // "Generate" action drives both this and the summary call).
  useEffect(() => {
    if (runTrigger) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runTrigger]);

  const addSelected = () => {
    const chosen = (cands ?? []).filter((c) => c.selected && c.title.trim());
    chosen.forEach((c) => onAdd({ title: c.title.trim(), detail: c.detail || undefined, isGlobal: c.isGlobal, locationIds: c.isGlobal ? [] : Array.from(c.locationIds), sources: ['leads'] as SourceType[] }));
    setCands(null);
    if (chosen.length) onDone?.(chosen.length);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed py-4 justify-center text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Reading for issues…
      </div>
    );
  }

  if (!cands) {
    // Nothing to show until the caller triggers a run (or the user retries below).
    return null;
  }

  if (cands.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        No trackable issues found in that transcript.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground">Found {cands.length} candidate issue{cands.length > 1 ? 's' : ''} for your workspace. Keep the ones worth tracking.</p>
      {cands.map((c, ix) => (
        <div key={ix} className={`rounded-lg border p-3 ${c.selected ? 'border-primary/40 bg-primary/5' : ''}`}>
          <div className="flex items-start gap-2.5">
            <button type="button" onClick={() => { c.selected = !c.selected; bump(); }} className={`mt-0.5 grid h-[18px] w-[18px] flex-shrink-0 place-items-center rounded border ${c.selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>{c.selected && <Check className="h-3 w-3" />}</button>
            <div className="min-w-0 flex-1">
              <input value={c.title} onChange={(e) => { c.title = e.target.value; bump(); }} className="w-full bg-transparent text-sm font-semibold focus:outline-none" />
              {c.detail && <div className="text-xs text-muted-foreground">{c.detail}</div>}
              <div className="mt-2 flex flex-wrap gap-1">
                <button type="button" onClick={() => { c.isGlobal = !c.isGlobal; bump(); }} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c.isGlobal ? 'border-transparent bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>Global</button>
                {!c.isGlobal && locations.map((l) => (
                  <button type="button" key={l.id} onClick={() => { if (c.locationIds.has(l.id)) { c.locationIds.delete(l.id); } else { c.locationIds.add(l.id); } bump(); }} className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${c.locationIds.has(l.id) ? 'border-transparent bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{l.name}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={() => setCands(null)}>Dismiss</Button>
        <Button type="button" size="sm" disabled={!cands.some((c) => c.selected)} onClick={addSelected}>
          <Sparkles className="mr-1.5 h-4 w-4" />Add selected to workspace
        </Button>
      </div>
    </div>
  );
}
