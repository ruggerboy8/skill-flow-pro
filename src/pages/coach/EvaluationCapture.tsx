import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Sparkles, Loader2, Check, X, Sun, Sprout, BookOpen, Lightbulb,
  HelpCircle, CircleDashed, MessageSquare, ChevronDown,
} from "lucide-react";
import {
  loadCaptureData,
  saveCaptureItem,
  separateFeedback,
  buildObserverNote,
  type CaptureData,
  type CaptureCompetency,
} from "@/lib/evalCaptureData";
import { VoiceCaptureButton } from "@/components/coach/VoiceCaptureButton";
import { getDomainColorRaw, getDomainColorRich, getDomainColorRichRaw } from "@/lib/domainColors";
import { submitEvaluation } from "@/lib/evaluations";
import { CaptureTour, TOUR_DISMISSED_KEY } from "@/components/coach/CaptureTour";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

const SCORES = [1, 2, 3, 4];
const INTRO_KEY = "evalCaptureIntroDismissed";
const draftsKey = (evalId: string) => `evalCaptureDrafts:${evalId}`;

type CompState = "scored" | "na" | "in-progress" | "untouched";
function competencyState(c: CaptureCompetency): CompState {
  if (c.observerScore != null) return "scored";
  if (c.observerIsNA) return "na";
  if (c.glow?.trim() || c.grow?.trim()) return "in-progress";
  return "untouched";
}

/**
 * Per-domain evaluation capture (beta), Tim's model: the left pane is
 * navigation + reference (pick a domain, then a competency, its Pro Moves shown
 * as reference with progress indicators); the right pane is a single feedback
 * module for the selected competency: a required score plus one blank surface
 * where the coach talks about everything they saw. Polish splits that into a
 * Glow and a Grow. Lives at /coach/:staffId/eval/:evalId/capture, alongside the
 * untouched classic EvaluationHub.
 */
export default function EvaluationCapture() {
  const { staffId, evalId } = useParams<{ staffId: string; evalId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [data, setData] = useState<CaptureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [openProMoves, setOpenProMoves] = useState<Set<number>>(new Set());
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [polishingId, setPolishingId] = useState<number | null>(null);
  const [showIntro, setShowIntro] = useState(() => {
    try { return localStorage.getItem(INTRO_KEY) !== "1"; } catch { return true; }
  });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(TOUR_DISMISSED_KEY) !== "1") setTourOpen(true); }
    catch { setTourOpen(true); }
  }, []);

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
          toast({ title: "Could not load evaluation", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [evalId, toast]);

  // Crash resilience for the raw (pre-Polish) feedback textarea, which otherwise
  // lives only in React state. Restore any saved drafts once when the eval opens,
  // then mirror every keystroke to localStorage so a closed tab, refresh, or
  // power loss never discards in-progress notes. Scores and glow/grow already
  // persist to the database as they're entered; this covers the one surface that
  // did not.
  const draftsRestored = useRef(false);
  useEffect(() => {
    if (!evalId) return;
    if (!draftsRestored.current) {
      draftsRestored.current = true;
      try {
        const raw = localStorage.getItem(draftsKey(evalId));
        if (raw) {
          const parsed = JSON.parse(raw) as Record<number, string>;
          if (parsed && typeof parsed === "object") {
            setDrafts(parsed);
            return; // skip the save pass below until the restored state lands
          }
        }
      } catch { /* ignore */ }
    }
    try {
      const hasContent = Object.values(drafts).some((v) => v && v.trim());
      if (hasContent) localStorage.setItem(draftsKey(evalId), JSON.stringify(drafts));
      else localStorage.removeItem(draftsKey(evalId));
    } catch { /* ignore */ }
  }, [drafts, evalId]);

  function patchCompetency(domainId: number, competencyId: number, patch: Partial<CaptureCompetency>) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        domains: prev.domains.map((d) =>
          d.domainId !== domainId ? d : {
            ...d,
            competencies: d.competencies.map((c) => c.competencyId === competencyId ? { ...c, ...patch } : c),
          }),
      };
    });
  }

  async function persist(competencyId: number, patch: Parameters<typeof saveCaptureItem>[2]) {
    if (!evalId) return;
    try {
      await saveCaptureItem(evalId, competencyId, patch);
    } catch (e) {
      toast({ title: "Save failed", description: e instanceof Error ? e.message : "Reloading to resync.", variant: "destructive" });
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

  async function handlePolish(domainId: number, comp: CaptureCompetency) {
    const raw = (drafts[comp.competencyId] || "").trim();
    if (!raw) {
      toast({ title: "Nothing to polish yet", description: "Talk or type your feedback first." });
      return;
    }
    // Gather the openings already used on OTHER competencies so the model can
    // deliberately vary phrasing across the evaluation (no two notes alike).
    const avoid: string[] = [];
    for (const d of data?.domains ?? []) {
      for (const c of d.competencies) {
        if (c.competencyId === comp.competencyId) continue;
        for (const note of [c.glow, c.grow]) {
          const t = note?.trim();
          if (t) avoid.push(t.split(/\s+/).slice(0, 10).join(" "));
        }
      }
    }
    setPolishingId(comp.competencyId);
    try {
      const { glow, grow } = await separateFeedback({
        competency: { name: comp.name, description: comp.description, proMoves: comp.proMoves },
        text: raw,
        existingGlow: comp.glow,
        existingGrow: comp.grow,
        avoid: Array.from(new Set(avoid)).slice(0, 24),
      });
      patchCompetency(domainId, comp.competencyId, { glow, grow });
      await persist(comp.competencyId, { observer_glow: glow, observer_grow: grow, observer_note: buildObserverNote(glow, grow) });
      setDrafts((p) => ({ ...p, [comp.competencyId]: "" }));
      toast({ title: "Polished", description: "Split into a glow and a grow below. Tweak if you like." });
    } catch (e) {
      toast({ title: "Polish failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setPolishingId(null);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        <Skeleton className="h-9 w-72 rounded-lg" />
        <div className="flex flex-wrap justify-center gap-2">
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
  const richColor = getDomainColorRich(activeDomain.domainName);
  const richRaw = getDomainColorRaw(activeDomain.domainName);
  const tint = `hsl(${richRaw} / 0.18)`;
  // Selected competency falls back to the first in the active domain, so
  // switching domains auto-selects a fresh one without extra state.
  const selectedComp = activeDomain.competencies.find((c) => c.competencyId === selectedId) ?? activeDomain.competencies[0];

  const totalRated = data.domains.reduce(
    (acc, d) => acc + d.competencies.filter((c) => c.observerScore != null || c.observerIsNA).length, 0);
  const totalCompetencies = data.domains.reduce((acc, d) => acc + d.competencies.length, 0);
  const allDone = totalCompetencies > 0 && totalRated === totalCompetencies;

  const unscored = data.domains.flatMap((d) => d.competencies.filter((c) => c.observerScore == null && !c.observerIsNA));
  const lowMissingNote = data.domains.flatMap((d) =>
    d.competencies.filter((c) => c.observerScore != null && c.observerScore <= 2 && !c.glow?.trim() && !c.grow?.trim()));
  const canSubmit = unscored.length === 0 && lowMissingNote.length === 0;

  async function handleSubmit() {
    if (!evalId) return;
    setSubmitting(true);
    try {
      await submitEvaluation(evalId);
      toast({ title: "Evaluation submitted", description: "Sent to your central office to review and release." });
      navigate(`/coach/${staffId}`);
    } catch (e) {
      toast({ title: "Submit failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
      setSubmitting(false);
    }
  }

  function domainProgress(domainId: number) {
    const d = data!.domains.find((x) => x.domainId === domainId)!;
    const rated = d.competencies.filter((c) => c.observerScore != null || c.observerIsNA).length;
    return { rated, total: d.competencies.length };
  }

  const draft = selectedComp ? drafts[selectedComp.competencyId] ?? "" : "";

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">Evaluation capture</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex h-1.5 w-1.5 rounded-full" style={{ background: allDone ? "hsl(var(--status-complete))" : richColor }} aria-hidden />
            {allDone ? <span className="text-foreground font-medium">All competencies scored</span>
              : <span>{totalRated} of {totalCompetencies} competencies scored</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => navigate(`/coach/${staffId}/eval/${evalId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Classic editor
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setTourOpen(true)} aria-label="Show tutorial">
            <HelpCircle className="h-4 w-4 mr-2" /> Show tutorial
          </Button>
          <span id="tour-submit" className="inline-flex rounded-full">
            <Button size="sm" onClick={() => setReviewOpen(true)}>Review &amp; submit</Button>
          </span>
        </div>
      </div>

      {/* Lighter persistent hint (hidden while the tour is open) */}
      {showIntro && !tourOpen && (
        <Card className="border-none shadow-sm" style={{ backgroundColor: tint }}>
          <CardContent className="py-4 flex items-start gap-3.5">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-background/70" aria-hidden>
              <Lightbulb className="h-5 w-5" style={{ color: richColor }} />
            </span>
            <div className="flex-1 text-sm text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">How this works</p>
              <p className="leading-relaxed">
                Pick a domain, then a competency on the left. On the right, set a score and talk about
                what you saw, the good and the not-yet. Hit Polish and we'll split it into a glow and a
                grow. Work through the competencies in any order until each has a score.
              </p>
            </div>
            <button className="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1 -m-1" aria-label="Dismiss"
              onClick={() => { setShowIntro(false); try { localStorage.setItem(INTRO_KEY, "1"); } catch { /* ignore */ } }}>
              <X className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}

      {/* Domain pills (navigation) */}
      <div className="flex flex-wrap justify-center gap-2">
        {data.domains.map((d, i) => {
          const { rated, total } = domainProgress(d.domainId);
          const complete = rated === total && total > 0;
          const active = i === activeIdx;
          const raw = getDomainColorRaw(d.domainName);
          return (
            <button key={d.domainId} onClick={() => { setActiveIdx(i); setSelectedId(null); }} aria-pressed={active}
              className="group inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-sm border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              style={active
                ? { backgroundColor: `hsl(${raw} / 0.45)`, borderColor: getDomainColorRich(d.domainName), color: "hsl(var(--foreground))", fontWeight: 600, boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)" }
                : { backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                style={complete ? { background: "hsl(var(--status-complete))", color: "white" }
                  : { background: `hsl(${getDomainColorRichRaw(d.domainName)})`, opacity: active ? 1 : 0.55 }} aria-hidden>
                {complete && <Check className="h-3 w-3" />}
              </span>
              {d.domainName}
              <span className="text-2xs tabular-nums opacity-70">{rated}/{total}</span>
            </button>
          );
        })}
      </div>

      {/* Two-pane: navigation+reference | feedback module */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* LEFT: navigation + reference */}
        <aside id="tour-rubric" className="lg:col-span-2 space-y-3">
          <div className="flex items-center gap-2 px-1">
            <BookOpen className="h-4 w-4" style={{ color: richColor }} />
            <p className="text-2xs font-semibold uppercase tracking-[0.12em]" style={{ color: richColor }}>
              {activeDomain.domainName} &middot; pick a competency
            </p>
          </div>
          {activeDomain.competencies.map((comp) => {
            const isSel = selectedComp?.competencyId === comp.competencyId;
            const st = competencyState(comp);
            return (
              <Card key={comp.competencyId}
                className="cursor-pointer shadow-sm transition-all hover:shadow-md"
                style={isSel ? { borderColor: richColor, boxShadow: `0 0 0 1px ${richColor}`, backgroundColor: `hsl(${richRaw} / 0.08)` } : undefined}
                onClick={() => setSelectedId(comp.competencyId)}>
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-start gap-2.5">
                    {/* Progress indicator */}
                    <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                      style={st === "scored" ? { background: "hsl(var(--status-complete))", color: "white" }
                        : st === "na" ? { background: "hsl(var(--muted-foreground) / 0.4)", color: "white" }
                        : st === "in-progress" ? { background: richColor }
                        : { boxShadow: "inset 0 0 0 1.5px hsl(var(--border))" }}
                      aria-label={st} title={st === "scored" ? "Scored" : st === "na" ? "Did not observe" : st === "in-progress" ? "Feedback started" : "Not started"}>
                      {st === "scored" && <Check className="h-2.5 w-2.5" />}
                      {st === "na" && <X className="h-2.5 w-2.5" />}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold leading-snug">{comp.name}</div>
                      {comp.tagline && <div className="text-xs text-muted-foreground leading-snug mt-0.5">{comp.tagline}</div>}
                    </div>
                    {comp.observerScore != null && (
                      <span className="ml-auto shrink-0 inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-2xs font-bold"
                        style={{ backgroundColor: `hsl(var(--score-${comp.observerScore}))`, color: "white" }}>
                        {comp.observerScore}
                      </span>
                    )}
                  </div>
                  {/* Pro Moves: collapsed by default, click in and out to keep the list clean */}
                  {comp.proMoves.length > 0 && (
                    <div className="ml-[1.625rem]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenProMoves((prev) => {
                            const next = new Set(prev);
                            next.has(comp.competencyId) ? next.delete(comp.competencyId) : next.add(comp.competencyId);
                            return next;
                          });
                        }}
                        aria-expanded={openProMoves.has(comp.competencyId)}
                        className="inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openProMoves.has(comp.competencyId) ? "" : "-rotate-90"}`} />
                        Pro Moves <span className="opacity-60">({comp.proMoves.length})</span>
                      </button>
                      {openProMoves.has(comp.competencyId) && (
                        <ul className="mt-1.5 space-y-1.5">
                          {comp.proMoves.map((pm, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
                              <Check className="mt-0.5 h-3 w-3 shrink-0" style={{ color: richColor }} />
                              <span>{pm}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </aside>

        {/* RIGHT: feedback module for the selected competency */}
        <div className="lg:col-span-3">
          {selectedComp && (
            <Card id="tour-feedback" className="overflow-hidden border-none shadow-md" style={{ backgroundColor: tint }}>
              <CardContent className="py-5 space-y-5">
                {/* Header + Did not observe */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-2xs font-semibold uppercase tracking-[0.12em]" style={{ color: richColor }}>{activeDomain.domainName}</p>
                    <p className="text-base font-semibold leading-tight">{selectedComp.name}</p>
                  </div>
                  <button onClick={() => handleNA(activeDomain.domainId, selectedComp)} aria-pressed={selectedComp.observerIsNA}
                    className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors ${
                      selectedComp.observerIsNA ? "border-foreground/20 bg-muted text-foreground" : "border-transparent bg-background/70 text-muted-foreground hover:text-foreground"}`}>
                    {selectedComp.observerIsNA && <Check className="h-3 w-3" />} Did not observe
                  </button>
                </div>

                {/* Required score */}
                <div className="rounded-xl bg-background/70 p-3.5">
                  <p className="text-sm font-semibold mb-2">Score <span className="text-muted-foreground font-normal">(required)</span></p>
                  <div className="flex items-center gap-1.5">
                    {SCORES.map((s) => {
                      const selected = selectedComp.observerScore === s;
                      return (
                        <button key={s} onClick={() => handleScore(activeDomain.domainId, selectedComp, s)} aria-pressed={selected}
                          className="h-10 w-10 rounded-md text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={selected
                            ? { backgroundColor: `hsl(var(--score-${s}))`, color: "white", boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.12)" }
                            : { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Blank feedback surface */}
                <div className="rounded-xl bg-background/70 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">Your feedback</span>
                    <VoiceCaptureButton onTranscript={(t) => setDrafts((p) => {
                      const cur = p[selectedComp.competencyId] ?? "";
                      return { ...p, [selectedComp.competencyId]: cur ? `${cur} ${t}` : t };
                    })} />
                  </div>
                  <Textarea className="bg-background" rows={4}
                    placeholder="Talk about what you saw for this competency, the good and the not-yet. We'll split it into a glow and a grow."
                    value={draft}
                    onChange={(e) => setDrafts((p) => ({ ...p, [selectedComp.competencyId]: e.target.value }))} />
                  <Button className="w-full" onClick={() => handlePolish(activeDomain.domainId, selectedComp)} disabled={polishingId != null}>
                    {polishingId === selectedComp.competencyId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Polish into glow &amp; grow
                  </Button>
                </div>

                {/* Polished result (editable) */}
                {(selectedComp.glow?.trim() || selectedComp.grow?.trim()) && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <Sun className="mt-2.5 h-4 w-4 shrink-0" style={{ color: "hsl(var(--score-4))" }} />
                      <Textarea className="bg-background" rows={2} placeholder="Glow"
                        value={selectedComp.glow ?? ""}
                        onChange={(e) => handleNoteChange(activeDomain.domainId, selectedComp, "glow", e.target.value)}
                        onBlur={() => handleNoteBlur(selectedComp)} />
                    </div>
                    <div className="flex items-start gap-2">
                      <Sprout className="mt-2.5 h-4 w-4 shrink-0" style={{ color: "hsl(var(--score-2))" }} />
                      <Textarea className="bg-background" rows={2} placeholder="Grow"
                        value={selectedComp.grow ?? ""}
                        onChange={(e) => handleNoteChange(activeDomain.domainId, selectedComp, "grow", e.target.value)}
                        onBlur={() => handleNoteBlur(selectedComp)} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Review & submit */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review &amp; submit</DialogTitle>
            <DialogDescription>
              Submitting sends this to your central office to review and release. The team member does not
              see it until it is released.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              {unscored.length === 0
                ? <Check className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--status-complete))" }} />
                : <CircleDashed className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--status-missing))" }} />}
              <span>{unscored.length === 0 ? "Every competency is scored or marked Did not observe"
                : `${unscored.length} competenc${unscored.length === 1 ? "y" : "ies"} still need a score`}</span>
            </div>
            <div className="flex items-center gap-2">
              {lowMissingNote.length === 0
                ? <Check className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--status-complete))" }} />
                : <MessageSquare className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--status-missing))" }} />}
              <span>{lowMissingNote.length === 0 ? "Low scores include a note"
                : `${lowMissingNote.length} low score${lowMissingNote.length === 1 ? "" : "s"} need a note`}</span>
            </div>
          </div>

          <div className="space-y-4">
            {data.domains.map((d) => (
              <div key={d.domainId} className="space-y-1.5">
                <p className="text-sm font-semibold" style={{ color: getDomainColorRich(d.domainName) }}>{d.domainName}</p>
                <div className="space-y-1">
                  {d.competencies.map((c) => {
                    const needsScore = c.observerScore == null && !c.observerIsNA;
                    const needsNote = c.observerScore != null && c.observerScore <= 2 && !c.glow?.trim() && !c.grow?.trim();
                    return (
                      <div key={c.competencyId} className="flex items-start justify-between gap-3 border-b border-border/50 pb-1 text-sm">
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-medium leading-snug">{c.name}</div>
                          {c.glow?.trim() && (
                            <div className="flex items-start gap-1.5 text-2xs text-muted-foreground">
                              <Sun className="mt-0.5 h-3 w-3 shrink-0" style={{ color: "hsl(var(--score-4))" }} />
                              <span className="line-clamp-2">{c.glow}</span>
                            </div>
                          )}
                          {c.grow?.trim() && (
                            <div className="flex items-start gap-1.5 text-2xs text-muted-foreground">
                              <Sprout className="mt-0.5 h-3 w-3 shrink-0" style={{ color: "hsl(var(--score-2))" }} />
                              <span className="line-clamp-2">{c.grow}</span>
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 inline-flex items-center gap-1.5 text-2xs font-medium">
                          {needsScore ? (
                            <span className="inline-flex items-center gap-1" style={{ color: "hsl(var(--status-missing))" }}>
                              <CircleDashed className="h-3.5 w-3.5" /> Needs score
                            </span>
                          ) : c.observerIsNA ? (
                            <span className="text-muted-foreground">N/A</span>
                          ) : (
                            <>
                              Score {c.observerScore}
                              {needsNote && <MessageSquare className="h-3.5 w-3.5" style={{ color: "hsl(var(--status-missing))" }} aria-label="needs a note" />}
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewOpen(false)}>Keep editing</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Submit evaluation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CaptureTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}
