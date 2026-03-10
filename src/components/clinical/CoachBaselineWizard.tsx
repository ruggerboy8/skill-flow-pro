import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useAudioRecording } from '@/hooks/useAudioRecording';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, ArrowLeft, Mic, MicOff, Loader2 } from 'lucide-react';
import { FloatingRecorderPill } from '@/components/coach/FloatingRecorderPill';
import { cn } from '@/lib/utils';

interface DomainGroup {
  domain_id: number;
  domain_name: string;
  color_hex: string;
  proMoves: { action_id: number; action_statement: string; competency_name: string }[];
}

interface CoachBaselineWizardProps {
  doctorStaffId: string;
  doctorName: string;
  onBack: () => void;
}

export function CoachBaselineWizard({ doctorStaffId, doctorName, onBack }: CoachBaselineWizardProps) {
  const { data: staff } = useStaffProfile();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Record<number, { score: number | null; note: string }>>({});
  const [domainNotes, setDomainNotes] = useState<Record<string, string>>({});
  const [isComplete, setIsComplete] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [activeDomainId, setActiveDomainId] = useState<number | null>(null);

  const domainRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const recorderCardRef = useRef<HTMLDivElement>(null);
  const [showFloatingPill, setShowFloatingPill] = useState(false);

  const { state: recState, controls: recControls } = useAudioRecording();

  // IntersectionObserver for domain tracking during recording
  useEffect(() => {
    if (!recState.isRecording) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestEntry: IntersectionObserverEntry | null = null;
        let bestRatio = 0;
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestEntry = entry;
          }
        });
        if (bestEntry) {
          const domainId = Number((bestEntry as any).target.dataset.domainId);
          if (!isNaN(domainId)) setActiveDomainId(domainId);
        }
      },
      { threshold: [0.1, 0.3, 0.5, 0.7, 0.9] }
    );

    domainRefs.current.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [recState.isRecording]);

  // Floating pill visibility
  useEffect(() => {
    if (!recorderCardRef.current || !recState.isRecording) {
      setShowFloatingPill(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setShowFloatingPill(!entry.isIntersecting),
      { threshold: 0.9 }
    );
    observer.observe(recorderCardRef.current);
    return () => observer.disconnect();
  }, [recState.isRecording]);

  // Fetch or create assessment
  const { data: existingAssessment } = useQuery({
    queryKey: ['coach-baseline-assessment', doctorStaffId, staff?.id],
    queryFn: async () => {
      if (!staff?.id) return null;
      const { data, error } = await supabase
        .from('coach_baseline_assessments')
        .select('id, status, domain_notes, recording_transcript')
        .eq('doctor_staff_id', doctorStaffId)
        .eq('coach_staff_id', staff.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!staff?.id,
  });

  // Fetch existing items
  const { data: existingItems } = useQuery({
    queryKey: ['coach-baseline-items', assessmentId],
    queryFn: async () => {
      if (!assessmentId) return [];
      const { data, error } = await supabase
        .from('coach_baseline_items')
        .select('action_id, rating, note_text')
        .eq('assessment_id', assessmentId);
      if (error) throw error;
      return data;
    },
    enabled: !!assessmentId,
  });

  // Fetch doctor pro moves by domain
  const { data: domains, isLoading: domainsLoading } = useQuery({
    queryKey: ['doctor-pro-moves-by-domain'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pro_moves')
        .select(`
          action_id,
          action_statement,
          competencies!fk_pro_moves_competency_id (
            name,
            domains!competencies_domain_id_fkey (
              domain_id,
              domain_name,
              color_hex
            )
          )
        `)
        .eq('role_id', 4)
        .eq('active', true)
        .order('action_id');
      if (error) throw error;

      const domainMap = new Map<number, DomainGroup>();
      data?.forEach((pm: any) => {
        const domain = pm.competencies?.domains;
        if (!domain?.domain_id) return;
        if (!domainMap.has(domain.domain_id)) {
          domainMap.set(domain.domain_id, {
            domain_id: domain.domain_id,
            domain_name: domain.domain_name,
            color_hex: domain.color_hex,
            proMoves: [],
          });
        }
        domainMap.get(domain.domain_id)!.proMoves.push({
          action_id: pm.action_id,
          action_statement: pm.action_statement,
          competency_name: pm.competencies?.name || '',
        });
      });
      return Array.from(domainMap.values());
    },
  });

  useEffect(() => {
    if (existingAssessment?.id) {
      setAssessmentId(existingAssessment.id);
      if (existingAssessment.status === 'completed') setIsComplete(true);
      if (existingAssessment.domain_notes && typeof existingAssessment.domain_notes === 'object') {
        setDomainNotes(existingAssessment.domain_notes as Record<string, string>);
      }
    }
  }, [existingAssessment]);

  useEffect(() => {
    if (existingItems?.length) {
      const loaded: Record<number, { score: number | null; note: string }> = {};
      existingItems.forEach(item => {
        loaded[item.action_id] = { score: item.rating, note: item.note_text || '' };
      });
      setRatings(loaded);
    }
  }, [existingItems]);

  // Create assessment
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!staff?.id) throw new Error('No staff ID');
      const { data, error } = await supabase
        .from('coach_baseline_assessments')
        .insert({ doctor_staff_id: doctorStaffId, coach_staff_id: staff.id, status: 'in_progress' })
        .select('id')
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => setAssessmentId(id),
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // Save rating
  const saveRatingMutation = useMutation({
    mutationFn: async ({ actionId, score, note }: { actionId: number; score: number | null; note: string }) => {
      if (!assessmentId) throw new Error('No assessment');
      const { error } = await supabase
        .from('coach_baseline_items')
        .upsert({
          assessment_id: assessmentId,
          action_id: actionId,
          rating: score,
          note_text: note || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'assessment_id,action_id' });
      if (error) throw error;
    },
  });

  // Save domain notes
  const saveDomainNotesMutation = useMutation({
    mutationFn: async (notes: Record<string, string>) => {
      if (!assessmentId) throw new Error('No assessment');
      const { error } = await supabase
        .from('coach_baseline_assessments')
        .update({ domain_notes: notes, updated_at: new Date().toISOString() })
        .eq('id', assessmentId);
      if (error) throw error;
    },
  });

  // Complete
  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!assessmentId) throw new Error('No assessment');
      const { error } = await supabase
        .from('coach_baseline_assessments')
        .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', assessmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coach-baseline-assessment'] });
      setIsComplete(true);
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const handleRatingChange = (actionId: number, score: number | null) => {
    const existingNote = ratings[actionId]?.note || '';
    setRatings(prev => ({ ...prev, [actionId]: { score, note: existingNote } }));
    saveRatingMutation.mutate({ actionId, score, note: existingNote });
  };

  const handleNoteChange = (actionId: number, noteText: string) => {
    setRatings(prev => ({ ...prev, [actionId]: { score: prev[actionId]?.score ?? null, note: noteText } }));
  };

  const handleNoteBlur = (actionId: number) => {
    const r = ratings[actionId];
    if (r) {
      saveRatingMutation.mutate({ actionId, score: r.score, note: r.note });
    }
  };

  const handleDomainNoteChange = (domainId: number, text: string) => {
    setDomainNotes(prev => {
      const updated = { ...prev, [String(domainId)]: text };
      return updated;
    });
  };

  const handleDomainNoteBlur = () => {
    saveDomainNotesMutation.mutate(domainNotes);
  };

  // Audio recording pipeline
  const handleFinishRecording = useCallback(async () => {
    if (!domains || !assessmentId) return;
    setIsProcessingAudio(true);

    try {
      const blob = await recControls.stopAndGetBlob();
      if (!blob) throw new Error('No audio captured');

      // 1. Transcribe
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      const { data: transcriptData, error: transcriptErr } = await supabase.functions.invoke('transcribe-audio', { body: formData });
      if (transcriptErr) throw transcriptErr;
      const transcript = transcriptData?.text || transcriptData?.transcript;
      if (!transcript) throw new Error('No transcript returned');

      // Save transcript
      await supabase
        .from('coach_baseline_assessments')
        .update({ recording_transcript: transcript, updated_at: new Date().toISOString() })
        .eq('id', assessmentId);

      // 2. Map to domain notes
      const domainPayload = domains.map(d => ({
        domain_id: d.domain_id,
        domain_name: d.domain_name,
        pro_moves: d.proMoves.map(pm => pm.action_statement),
      }));

      const { data: mappedData, error: mapErr } = await supabase.functions.invoke('map-baseline-domain-notes', {
        body: { transcript, domains: domainPayload },
      });
      if (mapErr) throw mapErr;

      const newNotes = mappedData?.domain_notes || {};

      // Merge with existing domain notes (AI notes appended)
      const merged = { ...domainNotes };
      for (const [key, value] of Object.entries(newNotes)) {
        if (typeof value === 'string' && value.trim()) {
          merged[key] = merged[key] ? `${merged[key]}\n\n${value}` : value as string;
        }
      }

      setDomainNotes(merged);
      await saveDomainNotesMutation.mutateAsync(merged);

      toast({ title: 'Recording processed', description: 'Domain notes have been populated from your feedback.' });
    } catch (e: any) {
      console.error('Audio processing error:', e);
      toast({ title: 'Processing error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessingAudio(false);
    }
  }, [domains, assessmentId, domainNotes, recControls]);

  // Auto-create assessment if none exists
  useEffect(() => {
    if (staff?.id && existingAssessment === null && !assessmentId && !createMutation.isPending) {
      createMutation.mutate();
    }
  }, [staff?.id, existingAssessment, assessmentId]);

  if (domainsLoading || !domains) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back to Doctor Detail
        </Button>
        <Card>
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-semibold">Assessment Complete</h2>
            <p className="text-muted-foreground">
              Your private baseline assessment for {doctorName} has been saved.
              You can view the comparison on the doctor's detail page.
            </p>
            <Button onClick={onBack}>Return to Doctor Detail</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalProMoves = domains.reduce((sum, d) => sum + d.proMoves.length, 0);
  const ratedCount = Object.values(ratings).filter(r => r.score !== null).length;
  const progressPct = totalProMoves > 0 ? Math.round((ratedCount / totalProMoves) * 100) : 0;
  const allRated = ratedCount === totalProMoves;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to Doctor Detail
      </Button>

      <div>
        <h1 className="text-xl font-semibold">Private Assessment: {doctorName}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Rate each Pro Move and optionally record verbal feedback. This is visible only to clinical directors.
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{domains.length} domains</span>
          <span>{ratedCount} of {totalProMoves} Pro Moves rated</span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      {/* Recording controls */}
      <Card ref={recorderCardRef}>
        <CardContent className="py-4">
          {isProcessingAudio ? (
            <div className="flex items-center gap-3 justify-center py-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Processing recording into domain notes…</span>
            </div>
          ) : !recState.isRecording ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Record Verbal Feedback</p>
                <p className="text-xs text-muted-foreground">
                  Narrate your assessment while scrolling through domains. Notes will be auto-mapped.
                </p>
              </div>
              <Button
                onClick={() => recControls.startRecording()}
                variant="outline"
                className="gap-2"
              >
                <Mic className="h-4 w-4" />
                Start Recording
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={cn("w-3 h-3 rounded-full", recState.isPaused ? "bg-amber-500" : "bg-destructive animate-pulse")} />
                <span className="text-sm font-mono tabular-nums">
                  {Math.floor(recState.recordingTime / 60)}:{(recState.recordingTime % 60).toString().padStart(2, '0')}
                </span>
                {activeDomainId && (
                  <span className="text-xs text-muted-foreground">
                    {domains.find(d => d.domain_id === activeDomainId)?.domain_name}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => recControls.togglePause()}>
                  {recState.isPaused ? 'Resume' : 'Pause'}
                </Button>
                <Button variant="destructive" size="sm" onClick={handleFinishRecording} className="gap-1.5">
                  <MicOff className="h-3.5 w-3.5" />
                  Finish & Map Notes
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Floating pill */}
      {showFloatingPill && (
        <FloatingRecorderPill
          recordingTime={recState.recordingTime}
          isRecording={recState.isRecording}
          isPaused={recState.isPaused}
          onPauseToggle={recControls.togglePause}
          onDoneClick={handleFinishRecording}
          activeCompetencyLabel={activeDomainId ? domains.find(d => d.domain_id === activeDomainId)?.domain_name : undefined}
        />
      )}

      {/* All domains — scrollable */}
      {domains.map(domain => (
        <div
          key={domain.domain_id}
          ref={el => { if (el) domainRefs.current.set(domain.domain_id, el); }}
          data-domain-id={domain.domain_id}
          className={cn(
            "rounded-lg border p-4 space-y-4 transition-all",
            recState.isRecording && activeDomainId === domain.domain_id && "ring-2 ring-primary/50"
          )}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: domain.color_hex || 'hsl(var(--primary))' }}
            />
            <h3 className="text-lg font-semibold">{domain.domain_name}</h3>
          </div>

          {/* Domain-level notes from recording */}
          {(domainNotes[String(domain.domain_id)] || recState.isRecording) && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Director Notes</p>
              <Textarea
                value={domainNotes[String(domain.domain_id)] || ''}
                onChange={(e) => handleDomainNoteChange(domain.domain_id, e.target.value)}
                onBlur={handleDomainNoteBlur}
                placeholder="Domain-level notes will appear here after recording…"
                className="min-h-[80px] text-sm"
              />
            </div>
          )}

          {/* Pro Move ratings */}
          <div className="space-y-3">
            {domain.proMoves.map(pm => {
              const r = ratings[pm.action_id] || { score: null, note: '' };
              return (
                <div key={pm.action_id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{pm.action_statement}</p>
                      <p className="text-xs text-muted-foreground">{pm.competency_name}</p>
                    </div>
                  </div>
                  {/* Rating buttons */}
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map(val => (
                      <button
                        key={val}
                        onClick={() => handleRatingChange(pm.action_id, r.score === val ? null : val)}
                        className={cn(
                          "w-8 h-8 rounded-md text-sm font-medium transition-colors border",
                          r.score === val
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-muted border-border"
                        )}
                      >
                        {val}
                      </button>
                    ))}
                    <button
                      onClick={() => handleRatingChange(pm.action_id, -1)}
                      className={cn(
                        "px-2 h-8 rounded-md text-xs font-medium transition-colors border",
                        r.score === -1
                          ? "bg-muted-foreground text-background border-muted-foreground"
                          : "bg-background hover:bg-muted border-border"
                      )}
                    >
                      N/A
                    </button>
                  </div>
                  {/* Note */}
                  <Textarea
                    value={r.note}
                    onChange={(e) => handleNoteChange(pm.action_id, e.target.value)}
                    onBlur={() => handleNoteBlur(pm.action_id)}
                    placeholder="Add a note…"
                    className="min-h-[60px] text-sm"
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Complete button */}
      <div className="sticky bottom-4 flex justify-end">
        <Button
          onClick={() => completeMutation.mutate()}
          disabled={!allRated || completeMutation.isPending}
          size="lg"
          className="shadow-lg"
        >
          {completeMutation.isPending ? 'Saving…' : allRated ? 'Complete Assessment' : `${ratedCount}/${totalProMoves} rated`}
        </Button>
      </div>
    </div>
  );
}
