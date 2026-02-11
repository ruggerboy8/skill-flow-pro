import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ArrowRight, Star, Target, CheckCircle2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { getDomainColor } from '@/lib/domainColors';
import { parseReviewPayload, type ReviewPayload, type ReviewPayloadItem } from '@/lib/reviewPayload';
import { CompetencyCard } from '@/components/review/CompetencyCard';

const STEP_LABELS = ['Intro', 'Full Evaluation', 'Highlights', 'Choose Focus', 'ProMoves'];

export default function EvaluationReview() {
  const { evalId } = useParams<{ evalId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const staffId = staffProfile?.id;

  const [step, setStep] = useState(0);
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [keepCrushingId, setKeepCrushingId] = useState<number | null>(null);
  const [improveIds, setImproveIds] = useState<Set<number>>(new Set());
  const [selectedActionIds, setSelectedActionIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(false);
  const improveSectionRef = useRef<HTMLDivElement>(null);

  // Fetch evaluation + staff validation
  const { data: evalData, isLoading: evalLoading, error: evalError } = useQuery({
    queryKey: ['eval-review', evalId, staffId],
    queryFn: async () => {
      if (!staffId || !evalId) throw new Error('Missing staff or evalId');
      const { data: evaluation, error } = await supabase
        .from('evaluations')
        .select('id, staff_id, status, is_visible_to_staff, program_year, quarter, type, review_payload, acknowledged_at, viewed_at')
        .eq('id', evalId)
        .single();
      if (error) throw error;
      if (!evaluation) throw new Error('Evaluation not found');
      if (evaluation.staff_id !== staffId) throw new Error('Not your evaluation');
      if (evaluation.status !== 'submitted') throw new Error('Evaluation is not submitted');
      if (!evaluation.is_visible_to_staff) throw new Error('Evaluation is not released');
      return { evaluation, staffId };
    },
    enabled: !!staffId && !!evalId,
  });

  // On mount: mark viewed + compute payload (once)
  useEffect(() => {
    if (!evalData || mountedRef.current) return;
    mountedRef.current = true;

    const init = async () => {
      try {
        if (!evalData.evaluation.viewed_at) {
          await supabase.rpc('mark_eval_viewed', { p_eval_id: evalId });
        }
        // Always call RPC — it returns cached v2 or recomputes
        const { data } = await supabase.rpc('compute_and_store_review_payload', { p_eval_id: evalId });
        const parsed = parseReviewPayload(data);
        if (parsed) {
          // Enrich with taglines
          const allCompIds = [
            ...parsed.top_candidates.map(c => c.competency_id),
            ...parsed.bottom_candidates.map(c => c.competency_id),
          ];
          if (allCompIds.length > 0) {
            const { data: comps } = await supabase
              .from('competencies')
              .select('competency_id, tagline')
              .in('competency_id', allCompIds);
            const taglineMap = new Map((comps ?? []).map(c => [c.competency_id, c.tagline]));
            parsed.top_candidates.forEach(c => { c.tagline = taglineMap.get(c.competency_id) ?? null; });
            parsed.bottom_candidates.forEach(c => { c.tagline = taglineMap.get(c.competency_id) ?? null; });
          }
        }
        setPayload(parsed);
      } catch (err) {
        console.error('Failed to initialize review:', err);
        toast.error('Failed to load review data');
      }
    };
    init();
  }, [evalData, evalId]);

  // Selected competency IDs for ProMoves — only the 2 improve competencies
  const selectedCompIds = useMemo(() => {
    const ids: number[] = [];
    improveIds.forEach(id => ids.push(id));
    return ids;
  }, [improveIds]);

  // Fetch ProMoves for user-selected improve competencies (Step 4)
  const { data: proMoves } = useQuery({
    queryKey: ['review-pro-moves', selectedCompIds],
    queryFn: async () => {
      if (selectedCompIds.length === 0) return [];
      const { data, error } = await supabase
        .from('pro_moves')
        .select('action_id, action_statement, competency_id, competencies!fk_pro_moves_competency_id(name, tagline, domains!competencies_domain_id_fkey(domain_name))')
        .in('competency_id', selectedCompIds)
        .eq('active', true)
        .order('competency_id')
        .order('action_id');
      if (error) throw error;
      return data ?? [];
    },
    enabled: selectedCompIds.length === 2 && step === 4,
  });

  // Group pro moves by competency
  const proMovesByCompetency = useMemo(() => {
    if (!proMoves) return new Map<number, typeof proMoves>();
    const map = new Map<number, typeof proMoves>();
    for (const pm of proMoves) {
      const cId = pm.competency_id!;
      if (!map.has(cId)) map.set(cId, []);
      map.get(cId)!.push(pm);
    }
    return map;
  }, [proMoves]);

  const toggleAction = (actionId: number) => {
    setSelectedActionIds(prev => {
      const next = new Set(prev);
      if (next.has(actionId)) {
        next.delete(actionId);
      } else if (next.size < 3) {
        next.add(actionId);
      } else {
        toast.error('Maximum 3 ProMoves');
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!evalId) return;
    setSaving(true);
    try {
      const actionIds = Array.from(selectedActionIds);
      const { error } = await supabase.rpc('save_eval_acknowledgement_and_focus', {
        p_eval_id: evalId,
        p_action_ids: actionIds,
      });
      if (error) throw error;
      toast.success('Focus saved and review completed!');
      queryClient.invalidateQueries({ queryKey: ['eval-review'] });
      queryClient.invalidateQueries({ queryKey: ['staff-quarter-focus'] });
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleKeepCrushingSelect = useCallback((compId: number) => {
    setKeepCrushingId(prev => prev === compId ? null : compId);
    setTimeout(() => {
      improveSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  }, []);

  const handleImproveToggle = useCallback((compId: number) => {
    setImproveIds(prev => {
      const next = new Set(prev);
      if (next.has(compId)) {
        next.delete(compId);
      } else if (next.size < 2) {
        next.add(compId);
      }
      return next;
    });
  }, []);

  // Already acknowledged
  if (evalData?.evaluation.acknowledged_at) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8 px-4">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-600" />
            <h2 className="text-xl font-semibold">Review Already Completed</h2>
            <p className="text-muted-foreground">You've already reviewed this evaluation.</p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate(`/evaluation/${evalId}`)}>
                View Full Scores
              </Button>
              <Button onClick={() => navigate('/')}>Back to Home</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (evalLoading || (evalData && !payload)) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8 px-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (evalError) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8 px-4">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{(evalError as Error).message}</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!payload) return null;

  const evalInfo = evalData!.evaluation;
  const periodLabel = evalInfo.type === 'Baseline' ? 'Baseline' : `${evalInfo.quarter} ${evalInfo.program_year}`;
  const focusSelectionComplete = keepCrushingId !== null && improveIds.size === 2;
  const totalSelected = (keepCrushingId ? 1 : 0) + improveIds.size;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => step > 0 ? setStep(step - 1) : navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {step > 0 ? 'Back' : 'Exit'}
        </Button>
        <span className="text-sm text-muted-foreground">
          Step {step + 1} of 5 — {STEP_LABELS[step]}
        </span>
      </div>

      {/* ─── Step 0: Intro ─────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">{periodLabel} Evaluation Review</h1>
          <Card>
            <CardContent className="py-8 space-y-5">
              <p className="text-muted-foreground">This review takes about 2 minutes. You'll do four things:</p>
              <ol className="space-y-2 text-sm list-decimal list-inside">
                <li><strong>Review your full evaluation</strong> — see all scores and notes</li>
                <li><strong>Scan highlights</strong> — see your top strengths and opportunities</li>
                <li><strong>Pick 3 competencies</strong> — 1 to keep crushing, 2 to improve</li>
                <li><strong>Choose 1–3 ProMoves</strong> — practical actions for your improvement areas</li>
              </ol>
              <p className="text-xs text-muted-foreground">Your focus will be pinned on Home so you can track progress.</p>
              <div className="flex flex-col gap-3 pt-2">
                <Button size="lg" onClick={() => setStep(1)}>
                  Start <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <div className="flex gap-4 justify-center">
                  <Button variant="link" size="sm" onClick={() => navigate('/')}>
                    Exit to Home
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ─── Step 1: View Full Evaluation ─────────────────── */}
      {step === 1 && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Review Your Full Evaluation</h1>
          <Card>
            <CardContent className="py-8 space-y-5">
              <p className="text-muted-foreground text-sm">
                Take a moment to review all your scores and coach notes before selecting your focus areas.
              </p>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => navigate(`/evaluation/${evalId}`)}
              >
                <Eye className="w-4 h-4 mr-2" /> View Full Evaluation
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Use the back button after reviewing to return here and continue.
              </p>
            </CardContent>
          </Card>
          <div className="flex justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
              Skip — I've already reviewed it
            </Button>
            <Button onClick={() => setStep(2)}>
              Next <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 2: Highlights ─────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Highlights</h1>

          {payload.sparse ? (
            <Card>
              <CardContent className="py-8 space-y-4">
                <p className="text-muted-foreground text-sm">Limited data available for this evaluation. Here's a summary by domain:</p>
                {payload.domain_summaries.map(ds => (
                  <div key={ds.domain_name} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <Badge variant="outline" style={{ borderColor: getDomainColor(ds.domain_name) }}>
                      {ds.domain_name}
                    </Badge>
                    <span className="text-sm">
                      Coach avg: <strong>{ds.observer_avg}</strong>
                      {ds.self_avg != null && <> · Self avg: <strong>{ds.self_avg}</strong></>}
                      <span className="text-muted-foreground"> ({ds.count_scored} items)</span>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Strengths */}
              {payload.top_candidates.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Star className="w-5 h-5 text-amber-500" />
                      Strengths We Saw
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {payload.top_candidates.slice(0, 2).map(item => (
                      <CompetencyCard key={item.competency_id} item={item} readOnly />
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Opportunities */}
              {payload.bottom_candidates.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="w-5 h-5 text-blue-500" />
                      Opportunities
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {payload.bottom_candidates.slice(0, 2).map(item => (
                      <CompetencyCard key={item.competency_id} item={item} readOnly />
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep(3)}>
              Next <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 3: Choose Focus Competencies ──────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Choose 3 Focus Competencies</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pick 1 to keep crushing and 2 to improve this quarter.
            </p>
          </div>

          {/* Panel A: Keep Crushing */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold">
              {payload.top_used_fallback ? 'Strongest Areas' : 'Keep Crushing'}{' '}
              <span className="text-muted-foreground font-normal text-sm">(pick 1)</span>
            </h2>
            {payload.top_candidates.map(item => (
              <CompetencyCard
                key={item.competency_id}
                item={item}
                selected={keepCrushingId === item.competency_id}
                onSelect={() => handleKeepCrushingSelect(item.competency_id)}
              />
            ))}
          </div>

          {/* Panel B: Improve */}
          <div className="space-y-3" ref={improveSectionRef}>
            <h2 className="text-base font-semibold">
              Improve This Quarter{' '}
              <span className="text-muted-foreground font-normal text-sm">(pick 2)</span>
            </h2>
            {payload.bottom_candidates.map(item => (
              <CompetencyCard
                key={item.competency_id}
                item={item}
                selected={improveIds.has(item.competency_id)}
                onSelect={() => handleImproveToggle(item.competency_id)}
                disabled={improveIds.size >= 2 && !improveIds.has(item.competency_id)}
              />
            ))}
          </div>

          {/* Progress + validation */}
          <div className="text-center space-y-2 pt-2">
            <p className="text-sm text-muted-foreground">
              {totalSelected} of 3 selected
            </p>
            {!focusSelectionComplete && (
              <p className="text-xs text-muted-foreground">
                {keepCrushingId === null ? 'Select 1 above' : ''}{keepCrushingId === null && improveIds.size < 2 ? ' and ' : ''}{improveIds.size < 2 ? `${2 - improveIds.size} more below` : ''} to continue
              </p>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep(4)} disabled={!focusSelectionComplete}>
              Next <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 4: ProMoves & Complete ────────────────────── */}
      {step === 4 && (
        <Step4ProMoves
          payload={payload}
          improveIds={improveIds}
          proMovesByCompetency={proMovesByCompetency}
          selectedActionIds={selectedActionIds}
          onToggle={toggleAction}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  );
}

// ─── Step 4 Component ──────────────────────────────────────────────────

function Step4ProMoves({
  payload,
  improveIds,
  proMovesByCompetency,
  selectedActionIds,
  onToggle,
  onSave,
  saving,
}: {
  payload: ReviewPayload;
  improveIds: Set<number>;
  proMovesByCompetency: Map<number, any[]>;
  selectedActionIds: Set<number>;
  onToggle: (id: number) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const getObserverNote = (compId: number): string | null => {
    const item = payload.bottom_candidates.find(c => c.competency_id === compId);
    return item?.observer_note?.trim() || null;
  };

  const orderedCompIds = Array.from(improveIds);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Choose ProMoves</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select 1–3 ProMoves for your improvement areas. These will be pinned to your home page.
        </p>
      </div>

      {orderedCompIds.map(compId => {
        const moves = proMovesByCompetency.get(compId) ?? [];
        if (moves.length === 0) return null;

        const compName = (moves[0]?.competencies as any)?.name ?? `Competency ${compId}`;
        const domainName = (moves[0]?.competencies as any)?.domains?.domain_name ?? '';
        const coachNote = getObserverNote(compId);

        return (
          <Card key={compId}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                {domainName && (
                   <Badge variant="outline" className="text-xs text-foreground" style={{ borderColor: getDomainColor(domainName), backgroundColor: getDomainColor(domainName) }}>
                    {domainName}
                  </Badge>
                )}
                <span className="font-medium text-sm">{compName}</span>
                <Badge variant="secondary" className="text-xs ml-auto">
                  Improve
                </Badge>
              </div>

              {coachNote && (
                <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded p-2 border-l-2 border-muted-foreground/30">
                  <span className="font-medium">Coach context:</span> {coachNote}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {moves.map(pm => (
                <label
                  key={pm.action_id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedActionIds.has(pm.action_id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/30'
                  }`}
                >
                  <Checkbox
                    checked={selectedActionIds.has(pm.action_id)}
                    onCheckedChange={() => onToggle(pm.action_id)}
                    className="mt-0.5"
                  />
                  <span className="text-sm leading-relaxed">{pm.action_statement}</span>
                </label>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {selectedActionIds.size > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          {selectedActionIds.size} of 3 ProMoves selected
        </p>
      )}

      <div className="space-y-3 pt-2">
        <Button
          className="w-full"
          size="lg"
          onClick={onSave}
          disabled={saving || selectedActionIds.size === 0}
        >
          {saving ? 'Saving...' : 'Save focus and complete review'}
        </Button>
      </div>
    </div>
  );
}
