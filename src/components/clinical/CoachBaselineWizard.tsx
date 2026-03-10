import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useAudioRecording } from '@/hooks/useAudioRecording';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, ArrowLeft, Mic, MicOff, Loader2, ChevronDown, RotateCcw } from 'lucide-react';
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
  const [isComplete, setIsComplete] = useState(false);
  const [isProcessingAudio, setIsProcessingAudio] = useState(false);
  const [activeActionId, setActiveActionId] = useState<number | null>(null);

  // Track which pro-move note textareas are open
  const [openNotes, setOpenNotes] = useState<Set<number>>(new Set());

  // Timeline for recording: which pro move was in view at what time
  const proMoveTimeline = useRef<{ action_id: number; t_start_ms: number }[]>([]);

  const proMoveRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { state: recState, controls: recControls } = useAudioRecording();

  // Get flat list of all action_ids for "first pro move" logic
  const allActionIds = domains?.flatMap(d => d.proMoves.map(pm => pm.action_id)) ?? [];

  // When recording starts, immediately highlight the first pro move
  useEffect(() => {
    if (recState.isRecording && activeActionId === null && allActionIds.length > 0) {
      const firstId = allActionIds[0];
      setActiveActionId(firstId);
      proMoveTimeline.current.push({ action_id: firstId, t_start_ms: 0 });
    }
    if (!recState.isRecording) {
      setActiveActionId(null);
    }
  }, [recState.isRecording]);

  // IntersectionObserver for pro-move tracking during recording
  // Use a narrow rootMargin band around the vertical center of the viewport
  useEffect(() => {
    if (!recState.isRecording) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry most centered in the viewport strip
        let bestEntry: IntersectionObserverEntry | null = null;
        let bestRatio = 0;
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestEntry = entry;
          }
        });
        if (bestEntry) {
          const actionId = Number((bestEntry as any).target.dataset.actionId);
          if (!isNaN(actionId)) {
            setActiveActionId(prev => {
              if (prev !== actionId) {
                proMoveTimeline.current.push({
                  action_id: actionId,
                  t_start_ms: recState.recordingTime * 1000,
                });
              }
              return actionId;
            });
          }
        }
      },
      {
        // Only consider elements that cross the center 20% band of the viewport
        rootMargin: '-40% 0px -40% 0px',
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
      }
    );

    proMoveRefs.current.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [recState.isRecording]);

  // Fetch or create assessment
  const { data: existingAssessment } = useQuery({
    queryKey: ['coach-baseline-assessment', doctorStaffId, staff?.id],
    queryFn: async () => {
      if (!staff?.id) return null;
      const { data, error } = await supabase
        .from('coach_baseline_assessments')
        .select('id, status, recording_transcript')
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
    }
  }, [existingAssessment]);

  useEffect(() => {
    if (existingItems?.length) {
      const loaded: Record<number, { score: number | null; note: string }> = {};
      const notesOpen = new Set<number>();
      existingItems.forEach(item => {
        loaded[item.action_id] = { score: item.rating, note: item.note_text || '' };
        if (item.note_text) notesOpen.add(item.action_id);
      });
      setRatings(loaded);
      setOpenNotes(notesOpen);
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

  const toggleNoteOpen = (actionId: number) => {
    setOpenNotes(prev => {
      const next = new Set(prev);
      if (next.has(actionId)) next.delete(actionId);
      else next.add(actionId);
      return next;
    });
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

      // 2. Map to pro-move notes
      const domainPayload = domains.map(d => ({
        domain_id: d.domain_id,
        domain_name: d.domain_name,
        pro_moves: d.proMoves.map(pm => ({ action_id: pm.action_id, action_statement: pm.action_statement })),
      }));

      const { data: mappedData, error: mapErr } = await supabase.functions.invoke('map-baseline-domain-notes', {
        body: { transcript, domains: domainPayload, timeline: proMoveTimeline.current },
      });
      if (mapErr) throw mapErr;

      const newNotes = mappedData?.pro_move_notes || {};

      // Merge AI notes into ratings and save each
      const updatedRatings = { ...ratings };
      const nowOpenNotes = new Set(openNotes);

      for (const [actionIdStr, noteText] of Object.entries(newNotes)) {
        const actionId = Number(actionIdStr);
        if (isNaN(actionId) || typeof noteText !== 'string' || !noteText.trim()) continue;

        const existing = updatedRatings[actionId] || { score: null, note: '' };
        const mergedNote = existing.note ? `${existing.note}\n\n${noteText}` : noteText;
        updatedRatings[actionId] = { ...existing, note: mergedNote };
        nowOpenNotes.add(actionId);

        // Save to DB
        saveRatingMutation.mutate({ actionId, score: existing.score, note: mergedNote });
      }

      setRatings(updatedRatings);
      setOpenNotes(nowOpenNotes);
      proMoveTimeline.current = [];

      toast({ title: 'Recording processed', description: 'Pro Move notes have been populated from your feedback.' });
    } catch (e: any) {
      console.error('Audio processing error:', e);
      toast({ title: 'Processing error', description: e.message, variant: 'destructive' });
    } finally {
      setIsProcessingAudio(false);
    }
  }, [domains, assessmentId, ratings, openNotes, recControls]);

  // Start over / delete recording
  const handleStartOver = useCallback(() => {
    recControls.stopAndGetBlob(); // discard
    proMoveTimeline.current = [];
    setActiveActionId(null);
    toast({ title: 'Recording discarded', description: 'You can start a new recording.' });
  }, [recControls]);

  // Auto-create assessment if none exists
  useEffect(() => {
    if (staff?.id && existingAssessment === null && !assessmentId && !createMutation.isPending) {
      createMutation.mutate();
    }
  }, [staff?.id, existingAssessment, assessmentId]);

  // Get active pro move's label for the floating pill
  const getActiveLabel = () => {
    if (!activeActionId || !domains) return undefined;
    for (const d of domains) {
      const pm = d.proMoves.find(p => p.action_id === activeActionId);
      if (pm) return pm.action_statement.slice(0, 60);
    }
    return undefined;
  };

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

      {/* Recording controls — only shows Start button when not recording */}
      {!recState.isRecording && !isProcessingAudio && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Record Verbal Feedback</p>
                <p className="text-xs text-muted-foreground">
                  Narrate your assessment while scrolling through Pro Moves. Notes will be auto-mapped to each Pro Move.
                </p>
              </div>
              <Button
                onClick={() => {
                  proMoveTimeline.current = [];
                  recControls.startRecording();
                }}
                variant="outline"
                className="gap-2"
              >
                <Mic className="h-4 w-4" />
                Start Recording
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isProcessingAudio && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-3 justify-center py-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Processing recording into Pro Move notes…</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Floating pill — always visible on left when recording */}
      {recState.isRecording && (
        <FloatingRecorderPill
          recordingTime={recState.recordingTime}
          isRecording={recState.isRecording}
          isPaused={recState.isPaused}
          onPauseToggle={recControls.togglePause}
          onStartOver={handleStartOver}
          activeCompetencyLabel={getActiveLabel()}
          showArrow
          alwaysShowStartOver
        />
      )}

      {/* All domains — scrollable */}
      {domains.map(domain => (
        <div key={domain.domain_id} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: domain.color_hex || 'hsl(var(--primary))' }}
            />
            <h3 className="text-lg font-semibold">{domain.domain_name}</h3>
          </div>

          {/* Pro Move ratings */}
          <div className="space-y-2">
            {domain.proMoves.map(pm => {
              const r = ratings[pm.action_id] || { score: null, note: '' };
              const isActive = recState.isRecording && activeActionId === pm.action_id;
              const noteIsOpen = openNotes.has(pm.action_id);

              return (
                <div
                  key={pm.action_id}
                  ref={el => { if (el) proMoveRefs.current.set(pm.action_id, el); }}
                  data-action-id={pm.action_id}
                  className={cn(
                    "border rounded-md p-3 space-y-2 transition-all duration-300",
                    isActive && "ring-[3px] ring-primary shadow-[0_0_12px_hsl(var(--primary)/0.3)] border-primary"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
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

                  {/* Collapsible note */}
                  <Collapsible open={noteIsOpen} onOpenChange={() => toggleNoteOpen(pm.action_id)}>
                    <CollapsibleTrigger asChild>
                      <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronDown className={cn("h-3 w-3 transition-transform", noteIsOpen && "rotate-180")} />
                        {r.note ? 'View note' : 'Add note'}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Textarea
                        value={r.note}
                        onChange={(e) => handleNoteChange(pm.action_id, e.target.value)}
                        onBlur={() => handleNoteBlur(pm.action_id)}
                        placeholder="Add a note…"
                        className="min-h-[60px] text-sm mt-1.5"
                      />
                    </CollapsibleContent>
                  </Collapsible>
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
