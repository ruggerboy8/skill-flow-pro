import { useEffect, useRef, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ArrowRight, Star, Target, GitCompare, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getDomainColor } from '@/lib/domainColors';
import { parseReviewPayload, type ReviewPayload, type ReviewPayloadItem } from '@/lib/reviewPayload';

export default function EvaluationReview() {
  const { evalId } = useParams<{ evalId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [step, setStep] = useState(1);
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [selectedActionIds, setSelectedActionIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const mountedRef = useRef(false);

  // Fetch evaluation + staff validation
  const { data: evalData, isLoading: evalLoading, error: evalError } = useQuery({
    queryKey: ['eval-review', evalId],
    queryFn: async () => {
      if (!user || !evalId) throw new Error('Missing user or evalId');

      const { data: staff } = await supabase
        .from('staff')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!staff) throw new Error('Staff record not found');

      const { data: evaluation, error } = await supabase
        .from('evaluations')
        .select('id, staff_id, status, is_visible_to_staff, program_year, quarter, type, review_payload, acknowledged_at, viewed_at')
        .eq('id', evalId)
        .single();
      if (error) throw error;
      if (!evaluation) throw new Error('Evaluation not found');
      if (evaluation.staff_id !== staff.id) throw new Error('Not your evaluation');
      if (evaluation.status !== 'submitted') throw new Error('Evaluation is not submitted');
      if (!evaluation.is_visible_to_staff) throw new Error('Evaluation is not released');

      return { evaluation, staffId: staff.id };
    },
    enabled: !!user && !!evalId,
  });

  // On mount: mark viewed + compute payload (once)
  useEffect(() => {
    if (!evalData || mountedRef.current) return;
    mountedRef.current = true;

    const init = async () => {
      try {
        // Mark viewed (idempotent)
        if (!evalData.evaluation.viewed_at) {
          await supabase.rpc('mark_eval_viewed', { p_eval_id: evalId });
        }

        // Compute payload if needed
        if (evalData.evaluation.review_payload) {
          setPayload(parseReviewPayload(evalData.evaluation.review_payload));
        } else {
          const { data } = await supabase.rpc('compute_and_store_review_payload', { p_eval_id: evalId });
          setPayload(parseReviewPayload(data));
        }
      } catch (err) {
        console.error('Failed to initialize review:', err);
        toast.error('Failed to load review data');
      }
    };
    init();
  }, [evalData, evalId]);

  // Fetch ProMoves for recommended competencies (Step 3)
  const recommendedCompIds = payload?.recommended_competency_ids ?? [];
  const { data: proMoves } = useQuery({
    queryKey: ['review-pro-moves', recommendedCompIds],
    queryFn: async () => {
      if (recommendedCompIds.length === 0) return [];
      const { data, error } = await supabase
        .from('pro_moves')
        .select('action_id, action_statement, competency_id, competencies!fk_pro_moves_competency_id(name, domains!competencies_domain_id_fkey(domain_name))')
        .in('competency_id', recommendedCompIds)
        .eq('active', true)
        .order('competency_id')
        .order('action_id');
      if (error) throw error;
      return data ?? [];
    },
    enabled: recommendedCompIds.length > 0,
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
        toast.error('Maximum 3 focus items');
      }
      return next;
    });
  };

  const handleSave = async (withFocus: boolean) => {
    if (!evalId) return;
    setSaving(true);
    try {
      const actionIds = withFocus ? Array.from(selectedActionIds) : [];
      const { error } = await supabase.rpc('save_eval_acknowledgement_and_focus', {
        p_eval_id: evalId,
        p_action_ids: actionIds,
      });
      if (error) throw error;

      toast.success(withFocus ? 'Focus saved and review completed!' : 'Review completed!');
      queryClient.invalidateQueries({ queryKey: ['eval-review'] });
      queryClient.invalidateQueries({ queryKey: ['staff-quarter-focus'] });
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Already acknowledged
  if (evalData?.evaluation.acknowledged_at) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 mx-auto text-green-600" />
            <h2 className="text-xl font-semibold">Review Already Completed</h2>
            <p className="text-muted-foreground">You've already reviewed this evaluation.</p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate(`/evaluation/${evalId}`)}>
                View Full Scores
              </Button>
              <Button onClick={() => navigate('/')}>
                Back to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (evalLoading || !payload) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (evalError) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 py-8">
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

  const evalInfo = evalData!.evaluation;
  const periodLabel = evalInfo.type === 'Baseline' ? 'Baseline' : `${evalInfo.quarter} ${evalInfo.program_year}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => step > 1 ? setStep(step - 1) : navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {step > 1 ? 'Back' : 'Exit'}
        </Button>
        <span className="text-sm text-muted-foreground">Step {step} of 3</span>
      </div>

      <h1 className="text-2xl font-bold">{periodLabel} Evaluation Review</h1>

      {/* Step 1: Highlights */}
      {step === 1 && (
        <Step1Highlights payload={payload} evalId={evalId!} />
      )}

      {/* Step 2: Alignment & Gaps */}
      {step === 2 && (
        <Step2AlignmentGaps payload={payload} />
      )}

      {/* Step 3: Focus & Complete */}
      {step === 3 && (
        <Step3Focus
          payload={payload}
          proMovesByCompetency={proMovesByCompetency}
          selectedActionIds={selectedActionIds}
          onToggle={toggleAction}
          onSave={() => handleSave(true)}
          onSkip={() => handleSave(false)}
          saving={saving}
        />
      )}

      {/* Navigation */}
      {step < 3 && (
        <div className="flex justify-end pt-4">
          <Button onClick={() => setStep(step + 1)}>
            Next <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Step 1: Highlights ─────────────────────────────────────────────────

function Step1Highlights({ payload, evalId }: { payload: ReviewPayload; evalId: string }) {
  const navigate = useNavigate();

  if (payload.sparse) {
    return (
      <Card>
        <CardContent className="py-8 space-y-4">
          <p className="text-muted-foreground">Limited data available for this evaluation. Here's a summary by domain:</p>
          {payload.domain_summaries.map(ds => (
            <div key={ds.domain_name} className="flex items-center gap-3 py-2 border-b last:border-0">
              <Badge style={{ backgroundColor: getDomainColor(ds.domain_name) }} className="text-foreground">
                {ds.domain_name}
              </Badge>
              <span className="text-sm">
                Observer avg: <strong>{ds.observer_avg}</strong>
                {ds.self_avg != null && <> • Self avg: <strong>{ds.self_avg}</strong></>}
                <span className="text-muted-foreground"> ({ds.count_scored} items)</span>
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Strengths */}
      {payload.strengths.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-500" />
              Strengths We Saw
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payload.strengths.map(item => (
              <PayloadItemRow key={item.competency_id} item={item} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Priorities */}
      {payload.priorities.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-500" />
              Top Priorities to Improve
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payload.priorities.map(item => (
              <PayloadItemRow key={item.competency_id} item={item} />
            ))}
          </CardContent>
        </Card>
      )}

      <Button variant="link" className="text-sm" onClick={() => navigate(`/evaluation/${evalId}`)}>
        See full scores →
      </Button>
    </div>
  );
}

// ─── Step 2: Alignment & Gaps ───────────────────────────────────────────

function Step2AlignmentGaps({ payload }: { payload: ReviewPayload }) {
  return (
    <div className="space-y-6">
      {payload.alignment.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-green-600" />
              Where You and Your Evaluator Aligned
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {payload.alignment.map(item => (
              <ComparisonRow key={item.competency_id} item={item} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Gaps Worth Clarifying
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payload.gaps.length > 0 ? (
            <div className="space-y-3">
              {payload.gaps.map(item => (
                <ComparisonRow key={item.competency_id} item={item} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No significant gaps detected — your self-assessment closely matched the observer's.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Step 3: Focus & Complete ───────────────────────────────────────────

function Step3Focus({
  payload,
  proMovesByCompetency,
  selectedActionIds,
  onToggle,
  onSave,
  onSkip,
  saving,
}: {
  payload: ReviewPayload;
  proMovesByCompetency: Map<number, any[]>;
  selectedActionIds: Set<number>;
  onToggle: (id: number) => void;
  onSave: () => void;
  onSkip: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Choose Your Focus</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select 1–3 Pro Moves to focus on this quarter. These will be pinned to your home page.
        </p>
      </div>

      {payload.recommended_competency_ids.map(compId => {
        const moves = proMovesByCompetency.get(compId) ?? [];
        if (moves.length === 0) return null;

        const compName = (moves[0]?.competencies as any)?.name ?? `Competency ${compId}`;
        const domainName = (moves[0]?.competencies as any)?.domains?.domain_name ?? '';

        return (
          <Card key={compId}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                {domainName && (
                  <Badge variant="outline" style={{ borderColor: getDomainColor(domainName) }}>
                    {domainName}
                  </Badge>
                )}
                <span className="font-medium text-sm">{compName}</span>
              </div>
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

      <div className="space-y-3 pt-4">
        <Button
          className="w-full"
          size="lg"
          onClick={onSave}
          disabled={saving || selectedActionIds.size === 0}
        >
          {saving ? 'Saving...' : 'Save focus and complete review'}
        </Button>
        <button
          type="button"
          className="w-full text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
          onClick={onSkip}
          disabled={saving}
        >
          Complete review without selecting focus
        </button>
      </div>

      {selectedActionIds.size > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {selectedActionIds.size} of 3 selected
        </p>
      )}
    </div>
  );
}

// ─── Shared sub-components ──────────────────────────────────────────────

function PayloadItemRow({ item }: { item: ReviewPayloadItem }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      <Badge variant="outline" className="mt-0.5 shrink-0" style={{ borderColor: getDomainColor(item.domain_name) }}>
        {item.domain_name}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{item.competency_name}</div>
        <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
          <span>Observer: <strong className="text-foreground">{item.observer_score}</strong></span>
          {item.self_score != null && (
            <span>Self: <strong className="text-foreground">{item.self_score}</strong></span>
          )}
        </div>
        {item.observer_note && (
          <p className="text-xs text-muted-foreground mt-1 italic">"{item.observer_note}"</p>
        )}
      </div>
    </div>
  );
}

function ComparisonRow({ item }: { item: ReviewPayloadItem }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b last:border-0">
      <Badge variant="outline" className="shrink-0" style={{ borderColor: getDomainColor(item.domain_name) }}>
        {item.domain_name}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{item.competency_name}</div>
      </div>
      <div className="flex gap-4 text-sm shrink-0">
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Observer</div>
          <div className="font-semibold">{item.observer_score}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-muted-foreground">Self</div>
          <div className="font-semibold">{item.self_score ?? '—'}</div>
        </div>
      </div>
    </div>
  );
}
