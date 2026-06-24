import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  ChevronDown,
  Check,
  AlertTriangle,
  X,
  Sun,
  Sprout,
  BookOpen,
  Lightbulb,
  PenLine,
} from "lucide-react";
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
import { getDomainColorRaw, getDomainColorRich, getDomainColorRichRaw } from "@/lib/domainColors";

const SCORES = [1, 2, 3, 4];
const INTRO_KEY = "evalCaptureIntroDismissed";

/**
 * Rebuilt per-domain evaluation capture (Phase 1, beta). Lives at
 * /coach/:staffId/eval/:evalId/capture, alongside the classic EvaluationHub
 * which is unchanged.
 *
 * Layout is bifurcated by function: a left REFERENCE pane (the rubric — what to
 * assess, what good looks like) and a right CAPTURE pane (input — feedback +
 * scores). This separation is deliberate; the two surfaces have opposite needs.
 * Visual/delight pass is a follow-up (design-ui-designer).
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
  const captureRef = useRef<HTMLDivElement>(null);

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

      setOpenIds((prev) => new Set([...prev, ...slottedIds]));
      setRecentlySlotted(slottedIds);
      setLowConfidence((prev) => new Set([...prev, ...lowConf]));
      setTimeout(() => setRecentlySlotted(new Set()), 4000);

      toast({
        title: "Feedback sorted",
        description: `Filed into ${slottedIds.size} ${slottedIds.size === 1 ? "competency" : "competencies"}. Review and adjust.`,
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
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        <Skeleton className="h-9 w-72 rounded-lg" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <Skeleton className="lg:col-span-2 h-72 w-full rounded-xl" />
          <Skeleton className="lg:col-span-3 h-72 w-full rounded-xl" />
        </div>
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
  const richRaw = getDomainColorRaw(activeDomain.domainName);
  const tint = `hsl(${richRaw} / 0.18)`;

  // Overall progress across every competency in every domain (for the header).
  const totalRated = data.domains.reduce(
    (acc, d) => acc + d.competencies.filter((c) => c.observerScore != null || c.observerIsNA).length,
    0,
  );
  const totalCompetencies = data.domains.reduce((acc, d) => acc + d.competencies.length, 0);
  const allDone = totalCompetencies > 0 && totalRated === totalCompetencies;

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
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">Evaluation capture</h1>
            <Badge variant="secondary" className="rounded-full">Beta</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className="inline-flex h-1.5 w-1.5 rounded-full"
              style={{ background: allDone ? "hsl(var(--status-complete))" : richColor }}
              aria-hidden
            />
            {allDone ? (
              <span className="text-foreground font-medium">All competencies scored</span>
            ) : (
              <span>
                {totalRated} of {totalCompetencies} competencies scored
              </span>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => navigate(`/coach/${staffId}/eval/${evalId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Classic editor
        </Button>
      </div>

      {/* Signposting */}
      {showIntro && (
        <Card className="border-none shadow-sm" style={{ backgroundColor: tint }}>
          <CardContent className="py-4 flex items-start gap-3.5">
            <span
              className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/70"
              aria-hidden
            >
              <Lightbulb className="h-5 w-5" style={{ color: richColor }} />
            </span>
            <div className="flex-1 text-sm text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">How this works</p>
              <p className="leading-relaxed">
                Give this team member feedback across their four domains. The left side is your rubric: what each
                domain and competency covers. The right side is where you speak or type your feedback and set scores.
                We'll polish what you say and file it under the right competencies. Work the domains in any order, and
                cover all four.
              </p>
            </div>
            <button
              className="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1 -m-1"
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
          const raw = getDomainColorRaw(d.domainName);
          return (
            <button
              key={d.domainId}
              onClick={() => setActiveIdx(i)}
              aria-pressed={active}
              className="group inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              style={
                active
                  ? {
                      backgroundColor: `hsl(${raw} / 0.45)`,
                      borderColor: getDomainColorRich(d.domainName),
                      color: "hsl(var(--foreground))",
                      fontWeight: 600,
                      boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
                    }
                  : {
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      color: "hsl(var(--muted-foreground))",
                    }
              }
            >
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                style={
                  complete
                    ? { background: "hsl(var(--status-complete))", color: "white" }
                    : { background: `hsl(${getDomainColorRichRaw(d.domainName)})`, opacity: active ? 1 : 0.55 }
                }
                aria-hidden
              >
                {complete && <Check className="h-3 w-3" />}
              </span>
              {d.domainName}
              <span className="text-2xs tabular-nums opacity-70">
                {rated}/{total}
              </span>
            </button>
          );
        })}
      </div>

      {/* Two-pane: REFERENCE (rubric) | CAPTURE (input) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* REFERENCE pane */}
        <aside className="lg:col-span-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto space-y-3 pr-1">
          <div className="flex items-center gap-2 px-1 pt-0.5">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Rubric &middot; {activeDomain.domainName}
            </p>
          </div>

          <Card
            className="overflow-hidden border-none shadow-sm"
            style={{ backgroundColor: `hsl(${richRaw} / 0.4)` }}
          >
            <CardContent className="py-4">
              <p className="text-sm leading-relaxed text-foreground/80">
                {activeDomain.summary ||
                  `Consider what you observed in ${activeDomain.domainName}. Use the competencies below as a guide.`}
              </p>
            </CardContent>
          </Card>

          {activeDomain.competencies.map((comp) => (
            <Card key={comp.competencyId} className="shadow-sm transition-shadow hover:shadow-md">
              <CardContent className="py-3.5 space-y-2">
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: richColor }}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold leading-snug">{comp.name}</div>
                    {comp.tagline && (
                      <div className="text-xs text-muted-foreground leading-snug mt-0.5">{comp.tagline}</div>
                    )}
                  </div>
                </div>
                {comp.proMoves.length > 0 && (
                  <details className="group ml-[1.125rem]">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                      What great looks like
                      <span className="opacity-60">({comp.proMoves.length})</span>
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {comp.proMoves.map((pm, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
                          <Check className="mt-0.5 h-3 w-3 shrink-0" style={{ color: richColor }} />
                          <span>{pm}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </CardContent>
            </Card>
          ))}
        </aside>

        {/* CAPTURE pane */}
        <div ref={captureRef} className="lg:col-span-3 space-y-5">
          {/* Input */}
          <Card className="overflow-hidden border-none shadow-md" style={{ backgroundColor: tint }}>
            <CardContent className="py-5 space-y-5">
              <div className="flex items-start gap-3">
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/70"
                  aria-hidden
                >
                  <Sparkles className="h-5 w-5" style={{ color: richColor }} />
                </span>
                <div>
                  <p className="text-base font-semibold leading-tight">Your feedback on {activeDomain.domainName}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Speak or type it naturally. We'll polish it and file it under the right competencies below.
                  </p>
                </div>
              </div>

              <FeedbackField
                icon={Sun}
                accent="--score-4"
                label="What's going well"
                tag="Glow"
                value={draft.glow}
                stems={GLOW_STEMS}
                onChange={(v) =>
                  setDomainText((p) => ({ ...p, [activeDomain.domainId]: { ...draft, glow: v } }))
                }
                onTranscript={(t) => appendDraft("glow", t)}
                onStem={(s) => appendDraft("glow", s)}
              />

              <FeedbackField
                icon={Sprout}
                accent="--score-2"
                label="Where they can grow"
                tag="Grow"
                value={draft.grow}
                stems={GROW_STEMS}
                onChange={(v) =>
                  setDomainText((p) => ({ ...p, [activeDomain.domainId]: { ...draft, grow: v } }))
                }
                onTranscript={(t) => appendDraft("grow", t)}
                onStem={(s) => appendDraft("grow", s)}
              />

              <Button
                className="w-full"
                size="lg"
                onClick={() => handleSlot(activeDomain.domainId)}
                disabled={slottingDomain != null}
              >
                {slottingDomain === activeDomain.domainId ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-5 w-5 mr-2" />
                )}
                Polish &amp; sort into competencies
              </Button>
            </CardContent>
          </Card>

          {/* Scores + seeded notes (condensed) */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1">
              <PenLine className="h-4 w-4 text-muted-foreground" />
              <p className="text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Score each competency
              </p>
            </div>
            {activeDomain.competencies.map((comp) => {
              const open = openIds.has(comp.competencyId) || Boolean(comp.glow) || Boolean(comp.grow);
              const highlight = recentlySlotted.has(comp.competencyId);
              const low = lowConfidence.has(comp.competencyId);
              return (
                <Card
                  key={comp.competencyId}
                  className="shadow-sm transition-all"
                  style={
                    highlight
                      ? { borderColor: richColor, boxShadow: `0 0 0 2px hsl(${richRaw} / 0.5)` }
                      : comp.observerIsNA
                        ? { opacity: 0.7 }
                        : undefined
                  }
                >
                  <CardContent className="py-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold leading-snug">
                        {comp.name}
                        {low && (
                          <span className="ml-2 inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground">
                            <AlertTriangle className="h-3 w-3" /> check placement
                          </span>
                        )}
                      </span>
                      <div
                        className="flex items-center gap-1 shrink-0 rounded-lg bg-muted/60 p-1"
                        role="group"
                        aria-label={`Score for ${comp.name}`}
                      >
                        {SCORES.map((s) => {
                          const selected = comp.observerScore === s;
                          return (
                            <button
                              key={s}
                              onClick={() => handleScore(activeDomain.domainId, comp, s)}
                              aria-pressed={selected}
                              className="h-8 w-8 rounded-md text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              style={
                                selected
                                  ? {
                                      backgroundColor: `hsl(var(--score-${s}))`,
                                      color: "white",
                                      boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.12)",
                                    }
                                  : {
                                      color: `hsl(var(--score-${s}))`,
                                      backgroundColor: `hsl(var(--score-${s}-bg))`,
                                    }
                              }
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {open && (
                      <div className="space-y-2 pt-0.5">
                        <div className="flex items-start gap-2">
                          <Sun className="mt-2.5 h-4 w-4 shrink-0" style={{ color: "hsl(var(--score-4))" }} />
                          <Textarea
                            className="bg-background"
                            rows={2}
                            placeholder="Glow (sorted from your notes, or write directly)"
                            value={comp.glow ?? ""}
                            onChange={(e) => handleNoteChange(activeDomain.domainId, comp, "glow", e.target.value)}
                            onBlur={() => handleNoteBlur(comp)}
                          />
                        </div>
                        <div className="flex items-start gap-2">
                          <Sprout className="mt-2.5 h-4 w-4 shrink-0" style={{ color: "hsl(var(--score-2))" }} />
                          <Textarea
                            className="bg-background"
                            rows={2}
                            placeholder="Grow (sorted from your notes, or write directly)"
                            value={comp.grow ?? ""}
                            onChange={(e) => handleNoteChange(activeDomain.domainId, comp, "grow", e.target.value)}
                            onBlur={() => handleNoteBlur(comp)}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      {!open ? (
                        <button
                          onClick={() => toggleOpen(comp.competencyId)}
                          className="text-2xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                        >
                          <ChevronDown className="h-3.5 w-3.5" /> Add a note
                        </button>
                      ) : (
                        <span />
                      )}
                      <button
                        onClick={() => handleNA(activeDomain.domainId, comp)}
                        aria-pressed={comp.observerIsNA}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors ${
                          comp.observerIsNA
                            ? "border-foreground/20 bg-muted text-foreground"
                            : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                        }`}
                      >
                        {comp.observerIsNA && <Check className="h-3 w-3" />}
                        Did not observe
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Presentational Glow/Grow input block. Pure markup; all state lives in the
 * parent and is threaded through callbacks, so behavior is unchanged.
 */
function FeedbackField({
  icon: Icon,
  accent,
  label,
  tag,
  value,
  stems,
  onChange,
  onTranscript,
  onStem,
}: {
  icon: React.ElementType;
  accent: string;
  label: string;
  tag: string;
  value: string;
  stems: string[];
  onChange: (value: string) => void;
  onTranscript: (text: string) => void;
  onStem: (stem: string) => void;
}) {
  return (
    <div className="rounded-xl bg-background/70 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-flex h-6 w-6 items-center justify-center rounded-lg"
            style={{ backgroundColor: `hsl(var(${accent}-bg))` }}
            aria-hidden
          >
            <Icon className="h-4 w-4" style={{ color: `hsl(var(${accent}))` }} />
          </span>
          <span className="text-sm font-semibold">{label}</span>
          <span
            className="rounded-full px-2 py-0.5 text-2xs font-medium"
            style={{ backgroundColor: `hsl(var(${accent}-bg))`, color: `hsl(var(${accent}))` }}
          >
            {tag}
          </span>
        </span>
        <VoiceCaptureButton onTranscript={onTranscript} />
      </div>
      <Textarea
        className="bg-background"
        rows={3}
        placeholder="Speak or type, or tap a starter below"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">
        {stems.map((s) => (
          <button
            key={s}
            onClick={() => onStem(s)}
            className="text-2xs px-2.5 py-1 rounded-full bg-background border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:shadow-sm transition-all text-left"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
