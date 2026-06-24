import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Sparkles, Loader2, ChevronDown, ChevronRight, Check, AlertTriangle, X } from "lucide-react";
import {
  loadCaptureData,
  saveCaptureItem,
  slotDomainFeedback,
  buildObserverNote,
  type CaptureData,
  type CaptureCompetency,
} from "@/lib/evalCaptureData";
import { GLOW_STEMS, GROW_STEMS } from "@/lib/evalCaptureFraming";
import { VoiceCaptureButton } from "@/components/coach/VoiceCaptureButton";
import { getDomainColorRaw, getDomainColorRich } from "@/lib/domainColors";

const SCORES = [1, 2, 3, 4];
const INTRO_KEY = "evalCaptureIntroDismissed";

/**
 * Rebuilt per-domain evaluation capture (Phase 1, beta). Lives at
 * /coach/:staffId/eval/:evalId/capture, alongside the classic EvaluationHub
 * which is unchanged.
 */
export default function EvaluationCapture() {
  const { staffId, evalId } = useParams<{ staffId: string; evalId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [data, setData] = useState<CaptureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [domainText, setDomainText] = useState<Record<number, { glow: string; grow: string }>>({});
  const [slottingDomain, setSlottingDomain] = useState<number | null>(null);
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());
  const [recentlySlotted, setRecentlySlotted] = useState<Set<number>>(new Set());
  const [lowConfidence, setLowConfidence] = useState<Set<number>>(new Set());
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return localStorage.getItem(INTRO_KEY) !== "1";
    } catch {
      return true;
    }
  });
  const outputRef = useRef<HTMLDivElement>(null);

  async function reload() {
    if (!evalId) return null;
    const result = await loadCaptureData(evalId);
    setData(result);
    return result;
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!evalId) return;
      setLoading(true);
      try {
        const result = await loadCaptureData(evalId);
        if (!cancelled) setData(result);
      } catch (e) {
        if (!cancelled) {
          toast({
            title: "Could not load evaluation",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [evalId, toast]);

  function patchCompetency(domainId: number, competencyId: number, patch: Partial<CaptureCompetency>) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        domains: prev.domains.map((d) =>
          d.domainId !== domainId
            ? d
            : {
                ...d,
                competencies: d.competencies.map((c) =>
                  c.competencyId === competencyId ? { ...c, ...patch } : c,
                ),
              },
        ),
      };
    });
  }

  // Persist a patch; on failure, resync from the DB so optimistic state can't diverge.
  async function persist(competencyId: number, patch: Parameters<typeof saveCaptureItem>[2]) {
    if (!evalId) return;
    try {
      await saveCaptureItem(evalId, competencyId, patch);
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Reloading to resync.",
        variant: "destructive",
      });
      await reload();
    }
  }

  function handleScore(domainId: number, comp: CaptureCompetency, score: number) {
    patchCompetency(domainId, comp.competencyId, { observerScore: score, observerIsNA: false });
    persist(comp.competencyId, { observer_score: score, observer_is_na: false });
  }

  function handleNA(domainId: number, comp: CaptureCompetency) {
    const next = !comp.observerIsNA;
    patchCompetency(domainId, comp.competencyId, { observerIsNA: next, observerScore: null });
    persist(comp.competencyId, { observer_is_na: next, observer_score: null });
  }

  // Controlled note edits: update state on change, persist (with observer_note back-compat) on blur.
  function handleNoteChange(domainId: number, comp: CaptureCompetency, field: "glow" | "grow", value: string) {
    patchCompetency(domainId, comp.competencyId, { [field]: value } as Partial<CaptureCompetency>);
  }

  function handleNoteBlur(comp: CaptureCompetency) {
    persist(comp.competencyId, {
      observer_glow: comp.glow?.trim() ? comp.glow : null,
      observer_grow: comp.grow?.trim() ? comp.grow : null,
      observer_note: buildObserverNote(comp.glow, comp.grow),
    });
  }

  async function handleSlot(domainId: number) {
    const domain = data?.domains.find((d) => d.domainId === domainId);
    if (!domain) return;
    const text = domainText[domainId] || { glow: "", grow: "" };
    if (!text.glow.trim() && !text.grow.trim()) {
      toast({ title: "Nothing to slot yet", description: "Add some Glow or Grow notes first." });
      return;
    }
    setSlottingDomain(domainId);
    try {
      const items = await slotDomainFeedback({
        domain: domain.domainName,
        competencies: domain.competencies.map((c) => ({
          id: c.competencyId,
          name: c.name,
          description: c.description,
          proMoves: c.proMoves,
        })),
        glowText: text.glow,
        growText: text.grow,
      });

      const slottedIds = new Set<number>();
      const lowConf = new Set<number>();
      for (const item of items) {
        const existing = domain.competencies.find((c) => c.competencyId === item.competency_id);
        // Merge, do not replace: only overwrite a field the slotter actually returned.
        const nextGlow = item.glow != null ? item.glow : existing?.glow ?? null;
        const nextGrow = item.grow != null ? item.grow : existing?.grow ?? null;
        patchCompetency(domainId, item.competency_id, { glow: nextGlow, grow: nextGrow });
        await persist(item.competency_id, {
          observer_glow: nextGlow,
          observer_grow: nextGrow,
          observer_note: buildObserverNote(nextGlow, nextGrow),
        });
        slottedIds.add(item.competency_id);
        if (item.confidence === "low") lowConf.add(item.competency_id);
      }

      // Open and highlight the competencies that received feedback.
      setOpenIds((prev) => new Set([...prev, ...slottedIds]));
      setRecentlySlotted(slottedIds);
      setLowConfidence((prev) => new Set([...prev, ...lowConf]));
      setTimeout(() => setRecentlySlotted(new Set()), 4000);
      outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

      toast({
        title: "Feedback sorted",
        description: `Filed into ${slottedIds.size} ${slottedIds.size === 1 ? "competency" : "competencies"} below. Review and adjust.`,
      });
    } catch (e) {
      toast({
        title: "Slotting failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSlottingDomain(null);
    }
  }

  function toggleOpen(id: number) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!data || data.domains.length === 0) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <p className="text-muted-foreground">No evaluation data found for this capture session.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(`/coach/${staffId}/eval/${evalId}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to classic editor
        </Button>
      </div>
    );
  }

  const activeDomain = data.domains[activeIdx];
  const draft = domainText[activeDomain.domainId] || { glow: "", grow: "" };
  const richColor = getDomainColorRich(activeDomain.domainName);
  const tint = `hsl(${getDomainColorRaw(activeDomain.domainName)} / 0.22)`;

  function appendDraft(field: "glow" | "grow", text: string) {
    setDomainText((p) => {
      const cur = p[activeDomain.domainId] || { glow: "", grow: "" };
      const existing = cur[field];
      const next = existing ? `${existing} ${text}` : text;
      return { ...p, [activeDomain.domainId]: { ...cur, [field]: next } };
    });
  }

  function domainProgress(domainId: number) {
    const d = data!.domains.find((x) => x.domainId === domainId)!;
    const rated = d.competencies.filter((c) => c.observerScore != null || c.observerIsNA).length;
    return { rated, total: d.competencies.length };
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">Evaluation capture</h1>
          <Badge variant="secondary">Beta</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/coach/${staffId}/eval/${evalId}`)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Classic editor
        </Button>
      </div>

      {/* Signposting */}
      {showIntro && (
        <Card className="bg-muted/40">
          <CardContent className="pt-4 pb-4 flex items-start justify-between gap-3">
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How this works</p>
              <p>
                You're giving this team member feedback across their four domains. In each one, read what the domain
                covers and glance at the Pro Moves, then say (or type) what's going well and where they can grow. We'll
                polish it and file it under the right competencies, where you set a 1&ndash;4 score for each. Work the
                domains in any order, but address all four.
              </p>
            </div>
            <button
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss"
              onClick={() => {
                setShowIntro(false);
                try {
                  localStorage.setItem(INTRO_KEY, "1");
                } catch {
                  /* ignore */
                }
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}

      {/* Domain stepper with color pills */}
      <div className="flex flex-wrap gap-2">
        {data.domains.map((d, i) => {
          const { rated, total } = domainProgress(d.domainId);
          const complete = rated === total && total > 0;
          const active = i === activeIdx;
          return (
            <button
              key={d.domainId}
              onClick={() => setActiveIdx(i)}
              className="px-3 py-1.5 rounded-full text-sm border transition-colors"
              style={
                active
                  ? {
                      backgroundColor: `hsl(${getDomainColorRaw(d.domainName)} / 0.3)`,
                      borderColor: getDomainColorRich(d.domainName),
                      color: "hsl(var(--foreground))",
                      fontWeight: 500,
                    }
                  : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
              }
            >
              <span className="inline-flex items-center gap-1.5">
                {complete && <Check className="h-3.5 w-3.5" />}
                {d.domainName}
                <span className="text-2xs opacity-70">
                  {rated}/{total}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Orientation: what this domain means for the role + competency overview */}
      <Card style={{ borderLeftColor: richColor, borderLeftWidth: 4 }}>
        <CardContent className="pt-4 space-y-3">
          <div className="text-sm">
            {activeDomain.summary ? (
              <p className="text-muted-foreground">{activeDomain.summary}</p>
            ) : (
              <p className="text-muted-foreground">
                Consider what you observed in {activeDomain.domainName}. Use the Pro Moves below as a guide.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {activeDomain.competencies.map((c) => (
              <span key={c.competencyId} className="text-2xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {c.name}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* INPUT TIER: your feedback for this domain */}
      <Card style={{ backgroundColor: tint }}>
        <CardContent className="pt-4 space-y-4">
          <div>
            <p className="text-sm font-medium">Your feedback on {activeDomain.domainName}</p>
            <p className="text-2xs text-muted-foreground">
              Write or speak it naturally. We'll polish it and file it under the right competencies below.
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">What's going well (Glow)</label>
              <VoiceCaptureButton onTranscript={(t) => appendDraft("glow", t)} />
            </div>
            <Textarea
              className="mt-1 bg-background"
              rows={3}
              placeholder={GLOW_STEMS[0]}
              value={draft.glow}
              onChange={(e) =>
                setDomainText((p) => ({ ...p, [activeDomain.domainId]: { ...draft, glow: e.target.value } }))
              }
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Where they can grow (Grow)</label>
              <VoiceCaptureButton onTranscript={(t) => appendDraft("grow", t)} />
            </div>
            <Textarea
              className="mt-1 bg-background"
              rows={3}
              placeholder={GROW_STEMS[0]}
              value={draft.grow}
              onChange={(e) =>
                setDomainText((p) => ({ ...p, [activeDomain.domainId]: { ...draft, grow: e.target.value } }))
              }
            />
          </div>
          <Button onClick={() => handleSlot(activeDomain.domainId)} disabled={slottingDomain != null}>
            {slottingDomain === activeDomain.domainId ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Polish &amp; sort into competencies
          </Button>
        </CardContent>
      </Card>

      {/* Connector */}
      <div className="flex justify-center text-muted-foreground">
        <ChevronDown className="h-5 w-5" />
      </div>

      {/* OUTPUT TIER: sorted into competencies */}
      <div ref={outputRef} className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground px-1">Competencies &mdash; review and score</p>
        {activeDomain.competencies.map((comp) => {
          const open = openIds.has(comp.competencyId);
          const highlight = recentlySlotted.has(comp.competencyId);
          const low = lowConfidence.has(comp.competencyId);
          return (
            <Card
              key={comp.competencyId}
              style={highlight ? { borderColor: richColor, boxShadow: `0 0 0 1px ${richColor}` } : undefined}
            >
              <CardContent className="pt-3 pb-3 space-y-2">
                {/* Header row: name + always-visible scoring */}
                <div className="flex items-center justify-between gap-3">
                  <button className="flex items-center gap-1.5 text-left" onClick={() => toggleOpen(comp.competencyId)}>
                    {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <span>
                      <span className="font-medium">{comp.name}</span>
                      {low && (
                        <span className="ml-2 inline-flex items-center gap-1 text-2xs text-muted-foreground">
                          <AlertTriangle className="h-3 w-3" /> check placement
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {SCORES.map((s) => {
                      const selected = comp.observerScore === s;
                      return (
                        <button
                          key={s}
                          onClick={() => handleScore(activeDomain.domainId, comp, s)}
                          className="h-8 w-8 rounded-md border text-sm font-medium transition-colors"
                          style={
                            selected
                              ? {
                                  backgroundColor: `hsl(var(--score-${s}))`,
                                  borderColor: `hsl(var(--score-${s}))`,
                                  color: "white",
                                }
                              : { borderColor: "hsl(var(--border))" }
                          }
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Expanded detail */}
                {open && (
                  <div className="space-y-2 pl-6">
                    {comp.proMoves.length > 0 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground">
                          See what great looks like ({comp.proMoves.length} Pro Moves)
                        </summary>
                        <ul className="mt-2 ml-4 list-disc space-y-1 text-muted-foreground">
                          {comp.proMoves.map((pm, i) => (
                            <li key={i}>{pm}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <Textarea
                      rows={2}
                      placeholder="Glow (sorted from your notes, or write directly)"
                      value={comp.glow ?? ""}
                      onChange={(e) => handleNoteChange(activeDomain.domainId, comp, "glow", e.target.value)}
                      onBlur={() => handleNoteBlur(comp)}
                    />
                    <Textarea
                      rows={2}
                      placeholder="Grow (sorted from your notes, or write directly)"
                      value={comp.grow ?? ""}
                      onChange={(e) => handleNoteChange(activeDomain.domainId, comp, "grow", e.target.value)}
                      onBlur={() => handleNoteBlur(comp)}
                    />
                  </div>
                )}

                {/* Did not observe: subordinate to scoring */}
                <div className="flex justify-end">
                  <button
                    onClick={() => handleNA(activeDomain.domainId, comp)}
                    className={`text-2xs underline-offset-2 hover:underline ${
                      comp.observerIsNA ? "text-foreground font-medium" : "text-muted-foreground"
                    }`}
                  >
                    {comp.observerIsNA ? "✓ Did not observe" : "Did not observe"}
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
