import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DomainBadge } from '@/components/ui/domain-badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ArrowRight, Star, Target, CheckCircle2, Eye, PenLine, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { parseReviewPayload, type ReviewPayload } from '@/lib/reviewPayload';
import { CompetencyCard } from '@/components/review/CompetencyCard';

const STEP_LABELS = ['Welcome', 'Full Evaluation', 'Highlights', 'Keep Crushing', 'Grow', 'ProMoves', 'Note to Self'];
const TOTAL_STEPS = STEP_LABELS.length;

function getStorageKey(evalId: string) {
  return `eval-review-step-${evalId}`;
}

export default function EvaluationReview() {
  const { evalId } = useParams<{ evalId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const staffId = staffProfile?.id;

  // Restore step from sessionStorage
  const [step, setStepRaw] = useState(() => {
    if (!evalId) return 0;
    const stored = sessionStorage.getItem(getStorageKey(evalId));
    return stored ? Math.min(parseInt(stored, 10) || 0, TOTAL_STEPS - 1) : 0;
  });

  const setStep = useCallback((s: number | ((prev: number) => number)) => {
    setStepRaw(prev => {
      const next = typeof s === 'function' ? s(prev) : s;
      if (evalId) sessionStorage.setItem(getStorageKey(evalId), String(next));
      return next;
    });
  }, [evalId]);

  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [keepCrushingId, setKeepCrushingId] = useState<number | null>(null);
  const [improveIds, setImproveIds] = useState<Set<number>>(new Set());
  const [selectedActionIds, setSelectedActionIds] = useState<Set<number>>(new Set());
  const [learnerNote, setLearnerNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const mountedRef = useRef(false);

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
      // Allow super admins to masquerade
      const isSuperAdmin = staffProfile?.is_super_admin || false;
      if (evaluation.staff_id !== staffId && !isSuperAdmin) throw new Error('Not your evaluation');
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
        const { data } = await supabase.rpc('compute_and_store_review_payload', { p_eval_id: evalId });
        const parsed = parseReviewPayload(data);
        if (parsed) {
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
  const selectedCompIds = useMemo(() => Array.from(improveIds), [improveIds]);

  // Fetch ProMoves for user-selected improve competencies (Step 5)
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
    enabled: selectedCompIds.length === 2 && step === 5,
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
    if (!evalId || !staffId) return;
    setSaving(true);
    try {
      const actionIds = Array.from(selectedActionIds);
      const { error } = await supabase.rpc('save_eval_acknowledgement_and_focus', {
        p_eval_id: evalId,
        p_action_ids: actionIds,
        p_learner_note: learnerNote.trim() || null,
        p_staff_id: staffId,
      });
      if (error) throw error;
      // Clean up sessionStorage
      sessionStorage.removeItem(getStorageKey(evalId));
      toast.success("You're all set! Your focus is pinned to Home.");
      queryClient.invalidateQueries({ queryKey: ['eval-review'] });
      queryClient.invalidateQueries({ queryKey: ['staff-quarter-focus'] });
      queryClient.invalidateQueries({ queryKey: ['current-focus-card'] });
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleKeepCrushingSelect = useCallback((compId: number) => {
    setKeepCrushingId(prev => prev === compId ? null : compId);
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

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => step > 0 ? setStep(step - 1) : navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {step > 0 ? 'Back' : 'Exit'}
        </Button>
        <span className="text-sm text-muted-foreground">
          Step {step + 1} of {TOTAL_STEPS} — {STEP_LABELS[step]}
        </span>
      </div>

      {/* ─── Step 0: Welcome ─────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">{periodLabel} Evaluation Review</h1>
          <Card>
            <CardContent className="py-8 space-y-5">
              <p className="text-muted-foreground">
                Nice work completing your evaluation! Let's take a couple of minutes to look at what stood out and set yourself up for a great quarter.
              </p>
              <p className="text-sm font-medium">Here's what we'll do together:</p>
              <ol className="space-y-2 text-sm list-decimal list-inside">
                <li><strong>Take a look at your full evaluation</strong> — review all your scores and notes</li>
                <li><strong>Check out your highlights</strong> — see where you're shining and where you can grow</li>
                <li><strong>Pick a strength to keep crushing</strong> — choose one area you're already rocking</li>
                <li><strong>Choose two areas to grow</strong> — select competencies to focus on this quarter</li>
                <li><strong>Pick your ProMoves</strong> — practical actions to help you improve</li>
                <li><strong>Write a note to yourself</strong> — a personal reminder for the quarter ahead</li>
              </ol>
              <p className="text-xs text-muted-foreground">Your selections will be pinned to your Home page so they're always easy to find.</p>
              <div className="flex flex-col gap-3 pt-2">
                <Button size="lg" onClick={() => setStep(1)}>
                  Let's Go <ArrowRight className="w-4 h-4 ml-2" />
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
                Before we dive in, take a moment to look through all your scores and coach notes. There's no rush — come back whenever you're ready.
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
              I've already looked through it — let's keep going
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
                    <DomainBadge domain={ds.domain_name} />
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
                    <p className="text-sm text-muted-foreground mt-1">
                      Here are a couple of areas where you really stood out.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {payload.top_candidates.slice(0, 2).map(item => (
                      <CompetencyCard key={item.competency_id} item={item} readOnly />
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Opportunities for Growth */}
              {payload.bottom_candidates.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="w-5 h-5 text-blue-500" />
                      Opportunities for Growth
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      And here are a couple of areas where a little extra focus could make a big difference.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {payload.bottom_candidates.slice(0, 3).map(item => (
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

      {/* ─── Step 3: Keep Crushing (pick 1) ──────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">
              {payload.top_used_fallback ? 'Your Strongest Areas' : 'Keep Crushing'}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              {payload.top_used_fallback
                ? "These were some of your strongest areas this quarter."
                : "These were some of your strongest competencies this quarter. It's worth celebrating what you're already doing well."
              }
            </p>
            <p className="text-sm font-bold mt-2">Pick one that you want to keep performing at a high level.</p>
          </div>

          <div className="space-y-3">
            {payload.top_candidates.map(item => (
              <CompetencyCard
                key={item.competency_id}
                item={item}
                selected={keepCrushingId === item.competency_id}
                onSelect={() => handleKeepCrushingSelect(item.competency_id)}
              />
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep(4)} disabled={keepCrushingId === null}>
              Next <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 4: Grow This Quarter (pick 2) ─────────── */}
      {step === 4 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Grow This Quarter</h1>
            <p className="text-sm text-muted-foreground mt-2">
              These are some competencies that could really benefit from a little extra attention — even small improvements here can make a real difference.
            </p>
            <p className="text-sm font-bold mt-2">Choose 2 that feel most important for you to focus on.</p>
          </div>

          <div className="space-y-3">
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

          <div className="text-center space-y-2 pt-2">
            <p className="text-sm text-muted-foreground">
              {improveIds.size} of 2 selected
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep(5)} disabled={improveIds.size < 2}>
              Next <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Step 5: ProMoves ────────────────────────────── */}
      {step === 5 && (
        <Step5ProMoves
          payload={payload}
          improveIds={improveIds}
          proMovesByCompetency={proMovesByCompetency}
          selectedActionIds={selectedActionIds}
          onToggle={toggleAction}
          onNext={() => setStep(6)}
        />
      )}

      {/* ─── Step 6: Note to Self ────────────────────────── */}
      {step === 6 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PenLine className="w-6 h-6" />
              Note to Self
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Before you wrap up, take a moment to write yourself a quick reminder. What do you want to make sure you keep in mind this quarter?
            </p>
          </div>

          <Card>
            <CardContent className="py-6 space-y-3">
              <Textarea
                placeholder="This quarter, I want to make sure I..."
                value={learnerNote}
                onChange={e => {
                  if (e.target.value.length <= 500) setLearnerNote(e.target.value);
                }}
                className="min-h-[120px] resize-none"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {learnerNote.length} / 500
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={learnerNote.trim().length === 0 || polishing}
                  onClick={async () => {
                    setPolishing(true);
                    try {
                      const { data, error } = await supabase.functions.invoke('polish-note', {
                        body: { text: learnerNote },
                      });
                      if (error) throw error;
                      if (data?.polished) {
                        setLearnerNote(data.polished.slice(0, 500));
                        toast.success('Note polished!');
                      }
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to polish note');
                    } finally {
                      setPolishing(false);
                    }
                  }}
                >
                  {polishing ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Polishing...</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> AI Help</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3 pt-2">
            <Button
              className="w-full"
              size="lg"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Complete My Review'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 5 Component ──────────────────────────────────────────────────

function Step5ProMoves({
  payload,
  improveIds,
  proMovesByCompetency,
  selectedActionIds,
  onToggle,
  onNext,
}: {
  payload: ReviewPayload;
  improveIds: Set<number>;
  proMovesByCompetency: Map<number, any[]>;
  selectedActionIds: Set<number>;
  onToggle: (id: number) => void;
  onNext: () => void;
}) {
  const getObserverNote = (compId: number): string | null => {
    const item = payload.bottom_candidates.find(c => c.competency_id === compId);
    return item?.observer_note?.trim() || null;
  };

  const orderedCompIds = Array.from(improveIds);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Choose Your ProMoves</h1>
        <p className="text-sm text-muted-foreground mt-2">
          From the two areas you chose to grow in, which ProMoves feel most important for you right now? Pick 1 to 3 that you want to focus on this quarter.
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
                {domainName && <DomainBadge domain={domainName} />}
                <span className="font-medium text-sm">{compName}</span>
                <Badge variant="secondary" className="text-xs ml-auto">Grow</Badge>
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

      <div className="flex justify-end pt-2">
        <Button onClick={onNext} disabled={selectedActionIds.size === 0}>
          Next <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
