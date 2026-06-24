import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, ArrowRight, Star, Target, CheckCircle2, PenLine, Sparkles, Loader2,
  MessageSquare, Sun, Sprout, PartyPopper,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { parseReviewPayload, type ReviewPayload } from '@/lib/reviewPayload';
import { CompetencyCard } from '@/components/review/CompetencyCard';
import { getDomainColorRich } from '@/lib/domainColors';

/**
 * Rebuilt staff evaluation review (Phase 2). Built alongside the classic
 * EvaluationReview (which is unchanged) at /evaluation/:evalId/review-v2.
 *
 * Reuses the proven data layer and RPCs (mark_eval_viewed,
 * compute_and_store_review_payload v4, save_eval_acknowledgement_and_focus,
 * polish-note) and the selection logic. What changes is the experience:
 * warm-first sequencing, an in-wizard per-domain walkthrough (no navigate-away),
 * de-emphasized gap, neutral N/A, no sparse degrade, and a closing recap that
 * names the weekly-loop handoff.
 */

const STEP_LABELS = [
  'Welcome', 'Note from Coach', 'Your Evaluation', 'Highlights',
  'Keep Crushing', 'Grow', 'Pro Moves', 'Note to Self', 'All Set',
];
const TOTAL_STEPS = STEP_LABELS.length;
const RECAP_STEP = 8;

function getStorageKey(evalId: string) {
  return `eval-review-v2-step-${evalId}`;
}

export default function EvaluationReviewV2() {
  const { evalId } = useParams<{ evalId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const staffId = staffProfile?.id;

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

  const { data: evalData, isLoading: evalLoading, error: evalError } = useQuery({
    queryKey: ['eval-review-v2', evalId, staffId],
    queryFn: async () => {
      if (!staffId || !evalId) throw new Error('Missing staff or evalId');
      const { data: evaluation, error } = await supabase
        .from('evaluations')
        .select('id, staff_id, status, is_visible_to_staff, program_year, quarter, type, review_payload, acknowledged_at, viewed_at, evaluator_note, evaluator_id')
        .eq('id', evalId)
        .single();
      if (error) throw error;
      if (!evaluation) throw new Error('Evaluation not found');
      const isSuperAdmin = staffProfile?.is_super_admin || false;
      if (evaluation.staff_id !== staffId && !isSuperAdmin) throw new Error('Not your evaluation');
      if (evaluation.status !== 'submitted') throw new Error('Evaluation is not submitted');
      if (!evaluation.is_visible_to_staff) throw new Error('Evaluation is not released');

      let evaluatorName = '';
      if ((evaluation as any).evaluator_id) {
        const { data: ev } = await supabase
          .from('staff').select('name').eq('id', (evaluation as any).evaluator_id).maybeSingle();
        if (ev?.name) evaluatorName = ev.name;
      }
      return { evaluation, staffId, evaluatorName };
    },
    enabled: !!staffId && !!evalId,
  });

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
            ...parsed.domain_breakdown.flatMap(d => d.items.map(i => i.competency_id)),
          ];
          if (allCompIds.length > 0) {
            const { data: comps } = await supabase
              .from('competencies').select('competency_id, tagline').in('competency_id', allCompIds);
            const taglineMap = new Map((comps ?? []).map(c => [c.competency_id, c.tagline]));
            parsed.top_candidates.forEach(c => { c.tagline = taglineMap.get(c.competency_id) ?? null; });
            parsed.bottom_candidates.forEach(c => { c.tagline = taglineMap.get(c.competency_id) ?? null; });
            parsed.domain_breakdown.forEach(d => d.items.forEach(i => { i.tagline = taglineMap.get(i.competency_id) ?? null; }));
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

  const selectedCompIds = useMemo(() => Array.from(improveIds), [improveIds]);

  const { data: proMoves } = useQuery({
    queryKey: ['review-v2-pro-moves', selectedCompIds],
    queryFn: async () => {
      if (selectedCompIds.length === 0) return [];
      const { data, error } = await supabase
        .from('pro_moves')
        .select('action_id, action_statement, competency_id, competencies!fk_pro_moves_competency_id(name, tagline, domains!competencies_domain_id_fkey(domain_name))')
        .in('competency_id', selectedCompIds)
        .eq('active', true)
        .order('competency_id').order('action_id');
      if (error) throw error;
      return data ?? [];
    },
    enabled: selectedCompIds.length >= 1 && step === 6,
  });

  const proMovesByCompetency = useMemo(() => {
    const map = new Map<number, NonNullable<typeof proMoves>>();
    for (const pm of proMoves ?? []) {
      const cId = pm.competency_id!;
      if (!map.has(cId)) map.set(cId, []);
      map.get(cId)!.push(pm);
    }
    return map;
  }, [proMoves]);

  const toggleAction = (actionId: number) => {
    setSelectedActionIds(prev => {
      const next = new Set(prev);
      if (next.has(actionId)) next.delete(actionId);
      else if (next.size < 3) next.add(actionId);
      else toast.error('Maximum 3 Pro Moves');
      return next;
    });
  };

  const handleSave = async () => {
    if (!evalId || !staffId) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('save_eval_acknowledgement_and_focus', {
        p_eval_id: evalId,
        p_action_ids: Array.from(selectedActionIds),
        p_learner_note: learnerNote.trim() || null,
        p_staff_id: staffId,
      });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['eval-review-v2'] });
      queryClient.invalidateQueries({ queryKey: ['staff-quarter-focus'] });
      queryClient.invalidateQueries({ queryKey: ['current-focus-card'] });
      queryClient.invalidateQueries({ queryKey: ['eval-ready-card'] });
      setStep(RECAP_STEP); // closing recap instead of bouncing to Home
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleImproveToggle = useCallback((compId: number) => {
    setImproveIds(prev => {
      const next = new Set(prev);
      if (next.has(compId)) next.delete(compId);
      else if (next.size < 2) next.add(compId);
      return next;
    });
  }, []);

  if (evalData?.evaluation.acknowledged_at && step !== RECAP_STEP) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8 px-4">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 mx-auto" style={{ color: 'hsl(var(--status-complete))' }} />
            <h2 className="text-xl font-semibold">Review already completed</h2>
            <p className="text-muted-foreground">You've already reviewed this evaluation.</p>
            <Button onClick={() => navigate('/')}>Back to Home</Button>
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
  const evaluatorName = evalData!.evaluatorName;
  const evaluatorNote = ((evalInfo as any).evaluator_note as string | null) || '';
  const hasEvaluatorNote = evaluatorNote.trim().length > 0;
  const periodLabel = evalInfo.type === 'Baseline' ? 'Baseline' : `${evalInfo.quarter} ${evalInfo.program_year}`;

  const keepName = payload.top_candidates.find(c => c.competency_id === keepCrushingId)?.competency_name;
  const growNames = payload.bottom_candidates.filter(c => improveIds.has(c.competency_id)).map(c => c.competency_name);
  const chosenMoves = (proMoves ?? []).filter(p => selectedActionIds.has(p.action_id)).map(p => p.action_statement);

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8 px-4">
      {/* Header (hidden on the recap) */}
      {step !== RECAP_STEP && (
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => step > 0 ? setStep(step - 1) : navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" /> {step > 0 ? 'Back' : 'Exit'}
          </Button>
          <span className="text-sm text-muted-foreground">
            Step {step + 1} of {TOTAL_STEPS - 1} &middot; {STEP_LABELS[step]}
          </span>
        </div>
      )}

      {/* Step 0: Welcome (warm, safety-first) */}
      {step === 0 && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">{periodLabel} review</h1>
          <Card>
            <CardContent className="py-8 space-y-5">
              <p className="text-muted-foreground leading-relaxed">
                This is your evaluation, a look at what's going well and a couple of things to grow next.
                It's yours, it's private to you and your coach, and it takes about five minutes. We'll start with
                a note from your coach, walk your domains together, then you'll choose what to focus on next.
              </p>
              <Button size="lg" onClick={() => setStep(1)}>
                Let's go <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step 1: Note from Coach (early peak) */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MessageSquare className="w-6 h-6" /> A note from {evaluatorName || 'your coach'}
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              {hasEvaluatorNote
                ? "Before anything else, here's a personal message from your coach."
                : "Your coach left their feedback inside each area, which you'll see as we walk through your domains."}
            </p>
          </div>
          {hasEvaluatorNote && (
            <Card><CardContent className="py-6">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{evaluatorNote}</p>
            </CardContent></Card>
          )}
          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep(2)}>Next <ArrowRight className="w-4 h-4 ml-2" /></Button>
          </div>
        </div>
      )}

      {/* Step 2: Per-domain walkthrough (in-wizard, replaces the off-ramp) */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Your evaluation, domain by domain</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Here's what your coach saw in each area. Scores sit next to the why, so the number always has a story.
            </p>
          </div>
          {payload.domain_breakdown.map(domain => (
            <Card key={domain.domain_name} style={{ borderLeftColor: getDomainColorRich(domain.domain_name), borderLeftWidth: 4 }}>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold" style={{ color: getDomainColorRich(domain.domain_name) }}>
                    {domain.domain_name}
                  </span>
                  {domain.observer_avg != null && (
                    <span className="text-2xs text-muted-foreground">Avg {domain.observer_avg}</span>
                  )}
                </div>
                {domain.items.map(item => (
                  <div key={item.competency_id} className="border-t border-border/50 pt-2 first:border-0 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-snug">{item.competency_name}</div>
                        {item.tagline && <div className="text-2xs italic text-muted-foreground">{item.tagline}</div>}
                      </div>
                      {item.observer_is_na ? (
                        <span className="shrink-0 text-2xs text-muted-foreground">Did not observe</span>
                      ) : item.observer_score != null ? (
                        <span
                          className="shrink-0 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-semibold"
                          style={{ backgroundColor: `hsl(var(--score-${item.observer_score}))`, color: 'white' }}
                        >
                          {item.observer_score}
                        </span>
                      ) : null}
                    </div>
                    {item.observer_is_na ? (
                      <p className="text-2xs text-muted-foreground italic mt-1">Didn't come up this round, not a gap.</p>
                    ) : (
                      <div className="mt-1.5 space-y-1">
                        {item.observer_glow?.trim() && (
                          <div className="flex items-start gap-1.5">
                            <Sun className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--score-4))' }} />
                            <p className="text-xs text-muted-foreground leading-relaxed">{item.observer_glow}</p>
                          </div>
                        )}
                        {item.observer_grow?.trim() && (
                          <div className="flex items-start gap-1.5">
                            <Sprout className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--score-2))' }} />
                            <p className="text-xs text-muted-foreground leading-relaxed">{item.observer_grow}</p>
                          </div>
                        )}
                        {!item.observer_glow?.trim() && !item.observer_grow?.trim() && item.observer_note?.trim() && (
                          <p className="text-xs text-muted-foreground leading-relaxed pl-1 border-l-2 border-muted">{item.observer_note}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep(3)}>Next <ArrowRight className="w-4 h-4 ml-2" /></Button>
          </div>
        </div>
      )}

      {/* Step 3: Highlights (strengths first) */}
      {step === 3 && (
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Your highlights</h1>
          {payload.top_candidates.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5" style={{ color: 'hsl(var(--score-4))' }} />
                <h2 className="text-lg font-semibold">Where you shone</h2>
              </div>
              {payload.top_candidates.slice(0, 3).map(item => (
                <CompetencyCard key={item.competency_id} item={item} readOnly hideGap />
              ))}
            </div>
          )}
          {payload.bottom_candidates.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5" style={{ color: 'hsl(var(--score-2))' }} />
                <h2 className="text-lg font-semibold">Where focus pays off</h2>
              </div>
              {payload.bottom_candidates.slice(0, 3).map(item => (
                <CompetencyCard key={item.competency_id} item={item} readOnly hideGap />
              ))}
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep(4)}>Next <ArrowRight className="w-4 h-4 ml-2" /></Button>
          </div>
        </div>
      )}

      {/* Step 4: Keep Crushing (pick 1) */}
      {step === 4 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Keep crushing</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Pick one strength you want to keep performing at a high level. The others are still yours, this is just
              your headline.
            </p>
          </div>
          <div className="space-y-3">
            {payload.top_candidates.map(item => (
              <CompetencyCard key={item.competency_id} item={item} hideGap
                selected={keepCrushingId === item.competency_id}
                onSelect={() => setKeepCrushingId(prev => prev === item.competency_id ? null : item.competency_id)} />
            ))}
          </div>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep(5)} disabled={keepCrushingId === null}>
              Next <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 5: Grow (pick 1-2) */}
      {step === 5 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Grow this quarter</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Choose one or two areas to focus on. Even a small, steady push here makes a real difference.
            </p>
          </div>
          <div className="space-y-3">
            {payload.bottom_candidates.map(item => (
              <CompetencyCard key={item.competency_id} item={item} hideGap
                selected={improveIds.has(item.competency_id)}
                onSelect={() => handleImproveToggle(item.competency_id)}
                disabled={improveIds.size >= 2 && !improveIds.has(item.competency_id)} />
            ))}
          </div>
          <p className="text-sm text-muted-foreground text-center">{improveIds.size} of up to 2 selected</p>
          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep(6)} disabled={improveIds.size < 1}>
              Next <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 6: Pro Moves */}
      {step === 6 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Choose your Pro Moves</h1>
            <p className="text-sm text-muted-foreground mt-2">
              From the areas you chose, pick one to three concrete Pro Moves to focus on. These will show up in your
              weekly check-ins.
            </p>
          </div>
          {Array.from(improveIds).map(compId => {
            const moves = proMovesByCompetency.get(compId) ?? [];
            const compName = (moves[0]?.competencies as any)?.name ?? `Competency ${compId}`;
            const growText = payload.bottom_candidates.find(c => c.competency_id === compId)?.observer_grow?.trim()
              || payload.bottom_candidates.find(c => c.competency_id === compId)?.observer_note?.trim();
            return (
              <Card key={compId}>
                <CardContent className="py-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{compName}</span>
                    <Badge variant="secondary" className="text-xs ml-auto">Grow</Badge>
                  </div>
                  {growText && (
                    <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Sprout className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--score-2))' }} />
                      <span>{growText}</span>
                    </div>
                  )}
                  {moves.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">No Pro Moves available for this area yet.</p>
                  ) : moves.map(pm => (
                    <label key={pm.action_id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedActionIds.has(pm.action_id) ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'}`}>
                      <Checkbox checked={selectedActionIds.has(pm.action_id)}
                        onCheckedChange={() => toggleAction(pm.action_id)} className="mt-0.5" />
                      <span className="text-sm leading-relaxed">{pm.action_statement}</span>
                    </label>
                  ))}
                </CardContent>
              </Card>
            );
          })}
          {selectedActionIds.size > 0 && (
            <p className="text-sm text-muted-foreground text-center">{selectedActionIds.size} of 3 selected</p>
          )}
          <div className="flex justify-end pt-2">
            <Button onClick={() => setStep(7)} disabled={selectedActionIds.size === 0}>
              Next <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 7: Note to Self */}
      {step === 7 && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><PenLine className="w-6 h-6" /> Note to self</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Write yourself a quick reminder for the quarter ahead. What do you want to keep in mind?
            </p>
          </div>
          <Card><CardContent className="py-6 space-y-3">
            <Textarea placeholder="This quarter, I want to make sure I..." value={learnerNote}
              onChange={e => { if (e.target.value.length <= 500) setLearnerNote(e.target.value); }}
              className="min-h-[120px] resize-none" />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{learnerNote.length} / 500</p>
              <Button variant="outline" size="sm" disabled={learnerNote.trim().length === 0 || polishing}
                onClick={async () => {
                  setPolishing(true);
                  try {
                    const focusAreas = [
                      ...payload.top_candidates.filter(c => c.competency_id === keepCrushingId),
                      ...payload.bottom_candidates.filter(c => improveIds.has(c.competency_id)),
                    ].map(c => ({ competency: c.competency_name, domain: c.domain_name, about: c.tagline ?? undefined }));
                    const { data, error } = await supabase.functions.invoke('polish-note', {
                      body: { text: learnerNote, context: { focusAreas, proMoves: chosenMoves } },
                    });
                    if (error) throw error;
                    if (data?.polished) { setLearnerNote(data.polished.slice(0, 500)); toast.success('Note polished!'); }
                  } catch (err: any) { toast.error(err.message || 'Failed to polish note'); }
                  finally { setPolishing(false); }
                }}>
                {polishing ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Polishing...</> : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> AI Help</>}
              </Button>
            </div>
          </CardContent></Card>
          <Button className="w-full" size="lg" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Complete my review'}
          </Button>
        </div>
      )}

      {/* Step 8: Closing recap + weekly-loop handoff */}
      {step === RECAP_STEP && (
        <div className="space-y-6">
          <Card>
            <CardContent className="py-8 space-y-5 text-center">
              <PartyPopper className="w-12 h-12 mx-auto" style={{ color: 'hsl(var(--score-4))' }} />
              <div>
                <h1 className="text-2xl font-bold">You're all set</h1>
                <p className="text-sm text-muted-foreground mt-2">Here's your plan for the quarter.</p>
              </div>
              <div className="text-left space-y-3 max-w-md mx-auto">
                {keepName && (
                  <div className="flex items-start gap-2">
                    <Star className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'hsl(var(--score-4))' }} />
                    <p className="text-sm">Keeping <strong>{keepName}</strong> strong.</p>
                  </div>
                )}
                {growNames.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Target className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'hsl(var(--score-2))' }} />
                    <p className="text-sm">Growing <strong>{growNames.join(' and ')}</strong>.</p>
                  </div>
                )}
                {chosenMoves.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Sprout className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'hsl(var(--score-2))' }} />
                    <div className="text-sm">
                      Your Pro Moves:
                      <ul className="list-disc list-inside mt-1 text-muted-foreground">
                        {chosenMoves.map((m, i) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                These are pinned to your Home, and you'll see them in your weekly check-ins.
              </p>
              <Button size="lg" onClick={() => { if (evalId) sessionStorage.removeItem(getStorageKey(evalId)); navigate('/'); }}>
                Back to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
