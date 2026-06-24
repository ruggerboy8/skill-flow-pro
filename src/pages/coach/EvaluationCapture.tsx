import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Sparkles, Loader2, ChevronDown, Check } from "lucide-react";
import {
  loadCaptureData,
  saveCaptureItem,
  slotDomainFeedback,
  type CaptureData,
  type CaptureCompetency,
} from "@/lib/evalCaptureData";
import { GLOW_STEMS, GROW_STEMS } from "@/lib/evalCaptureFraming";
import { VoiceCaptureButton } from "@/components/coach/VoiceCaptureButton";

const SCORES = [1, 2, 3, 4];

/**
 * Rebuilt per-domain evaluation capture (Phase 1, beta). Lives at
 * /coach/:staffId/eval/:evalId/capture, alongside the classic EvaluationHub
 * which is unchanged. Text-first slice; voice recording lands next.
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

  async function persist(competencyId: number, patch: Parameters<typeof saveCaptureItem>[2]) {
    if (!evalId) return;
    try {
      await saveCaptureItem(evalId, competencyId, patch);
    } catch (e) {
      toast({
        title: "Save failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
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

  function handleNoteBlur(domainId: number, comp: CaptureCompetency, field: "glow" | "grow", value: string) {
    const trimmed = value.trim() ? value : null;
    if ((field === "glow" ? comp.glow : comp.grow) === trimmed) return;
    patchCompetency(domainId, comp.competencyId, { [field]: trimmed } as Partial<CaptureCompetency>);
    persist(comp.competencyId, field === "glow" ? { observer_glow: trimmed } : { observer_grow: trimmed });
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
          proMoves: c.proMoves,
        })),
        glowText: text.glow,
        growText: text.grow,
      });
      for (const item of items) {
        patchCompetency(domainId, item.competency_id, { glow: item.glow, grow: item.grow });
        await persist(item.competency_id, { observer_glow: item.glow, observer_grow: item.grow });
      }
      toast({
        title: "Feedback slotted",
        description: `Sorted into ${items.length} ${items.length === 1 ? "competency" : "competencies"}. Review and adjust below.`,
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/coach/${staffId}/eval/${evalId}`)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Classic editor
        </Button>
      </div>

      {/* Domain stepper (free navigation) */}
      <div className="flex flex-wrap gap-2">
        {data.domains.map((d, i) => {
          const { rated, total } = domainProgress(d.domainId);
          const complete = rated === total && total > 0;
          return (
            <button
              key={d.domainId}
              onClick={() => setActiveIdx(i)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                i === activeIdx
                  ? "border-primary bg-primary/10 text-foreground font-medium"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
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

      {/* Domain summary (third person, prompts the evaluator) */}
      <Card>
        <CardContent className="pt-4">
          {activeDomain.summary ? (
            <p className="text-sm text-muted-foreground italic">{activeDomain.summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Consider what you observed in {activeDomain.domainName}. Use the Pro Moves below as a guide.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Glow / Grow capture for the domain */}
      <Card>
        <CardContent className="pt-4 space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">What's going well (Glow)</label>
              <VoiceCaptureButton onTranscript={(t) => appendDraft("glow", t)} />
            </div>
            <Textarea
              className="mt-1"
              rows={3}
              placeholder={GLOW_STEMS[0]}
              value={draft.glow}
              onChange={(e) =>
                setDomainText((p) => ({
                  ...p,
                  [activeDomain.domainId]: { ...draft, glow: e.target.value },
                }))
              }
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Where they can grow (Grow)</label>
              <VoiceCaptureButton onTranscript={(t) => appendDraft("grow", t)} />
            </div>
            <Textarea
              className="mt-1"
              rows={3}
              placeholder={GROW_STEMS[0]}
              value={draft.grow}
              onChange={(e) =>
                setDomainText((p) => ({
                  ...p,
                  [activeDomain.domainId]: { ...draft, grow: e.target.value },
                }))
              }
            />
          </div>
          <Button onClick={() => handleSlot(activeDomain.domainId)} disabled={slottingDomain != null}>
            {slottingDomain === activeDomain.domainId ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Polish &amp; slot into competencies
          </Button>
        </CardContent>
      </Card>

      {/* Competencies: Pro Moves, slotted notes, scoring */}
      <div className="space-y-3">
        {activeDomain.competencies.map((comp) => (
          <Card key={comp.competencyId}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{comp.name}</div>
                  {comp.tagline && <div className="text-2xs text-muted-foreground">{comp.tagline}</div>}
                </div>
              </div>

              {comp.proMoves.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground inline-flex items-center gap-1">
                    <ChevronDown className="h-3.5 w-3.5" /> {comp.proMoves.length} Pro Moves
                  </summary>
                  <ul className="mt-2 ml-4 list-disc space-y-1 text-muted-foreground">
                    {comp.proMoves.map((pm, i) => (
                      <li key={i}>{pm}</li>
                    ))}
                  </ul>
                </details>
              )}

              {/* Slotted Glow / Grow (editable) */}
              <div className="grid gap-2">
                <Textarea
                  rows={2}
                  placeholder="Glow (slotted from your notes, or write directly)"
                  defaultValue={comp.glow ?? ""}
                  onBlur={(e) => handleNoteBlur(activeDomain.domainId, comp, "glow", e.target.value)}
                />
                <Textarea
                  rows={2}
                  placeholder="Grow (slotted from your notes, or write directly)"
                  defaultValue={comp.grow ?? ""}
                  onBlur={(e) => handleNoteBlur(activeDomain.domainId, comp, "grow", e.target.value)}
                />
              </div>

              {/* Scoring */}
              <div className="flex items-center gap-2">
                {SCORES.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleScore(activeDomain.domainId, comp, s)}
                    className={`h-9 w-9 rounded-md border text-sm font-medium transition-colors ${
                      comp.observerScore === s
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {s}
                  </button>
                ))}
                <button
                  onClick={() => handleNA(activeDomain.domainId, comp)}
                  className={`h-9 px-3 rounded-md border text-xs transition-colors ${
                    comp.observerIsNA
                      ? "border-primary bg-primary/10 font-medium"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Did not observe
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
