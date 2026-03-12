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
import { CheckCircle2, ArrowLeft, Mic, MicOff, Loader2, ChevronDown, RotateCcw, FileText, Sparkles } from 'lucide-react';
import { FloatingRecorderPill } from '@/components/coach/FloatingRecorderPill';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const SCORE_CONFIG = [
  { value: 1, selected: 'bg-orange-100 border-orange-400 text-orange-800' },
  { value: 2, selected: 'bg-amber-100 border-amber-400 text-amber-800' },
  { value: 3, selected: 'bg-blue-100 border-blue-400 text-blue-800' },
  { value: 4, selected: 'bg-emerald-100 border-emerald-400 text-emerald-800' },
];

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
  const [activeActionId, setActiveActionId] = useState<number | null>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);

  // Track which pro-move note textareas are open
  const [openNotes, setOpenNotes] = useState<Set<number>>(new Set());

  // Timeline for recording: which pro move was in view at what time
  const proMoveTimeline = useRef<{ action_id: number; t_start_ms: number }[]>([]);

  const proMoveRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const { state: recState, controls: recControls } = useAudioRecording();

  // Two-step pipeline state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isMappingNotes, setIsMappingNotes] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const [mappingJustCompleted, setMappingJustCompleted] = useState(false);
  const [processingStep, setProcessingStep] = useState('');

  // Anchor top for the floating pill (tracks active card position)
  const [pillAnchorTop, setPillAnchorTop] = useState<number | null>(null);

  // Click-to-select: handle tapping a pro move card during recording
  const handleCardTap = useCallback((actionId: number) => {
    if (!recState.isRecording) return;
    const newId = activeActionId === actionId ? null : actionId;
    setActiveActionId(newId);
    if (newId !== null) {
      proMoveTimeline.current.push({ action_id: newId, t_start_ms: recState.recordingTime * 1000 });
      const el = proMoveRefs.current.get(newId);
      if (el) {
        const rect = el.getBoundingClientRect();
        setPillAnchorTop(rect.top + rect.height / 2);
      }
    } else {
      // Deselected — push a null segment for general notes
      proMoveTimeline.current.push({ action_id: 0, t_start_ms: recState.recordingTime * 1000 });
      setPillAnchorTop(null);
    }
  }, [recState.isRecording, recState.recordingTime, activeActionId]);

  // Fetch or create assessment
  const { data: existingAssessment, error: assessmentError } = useQuery({
    queryKey: ['coach-baseline-assessment', doctorStaffId, staff?.id],
    queryFn: async () => {
      console.log('[CoachBaseline] Fetching assessment for doctor:', doctorStaffId, 'coach:', staff?.id);
      if (!staff?.id) return null;
      const { data, error } = await supabase
        .from('coach_baseline_assessments')
        .select('id, status, recording_transcript')
        .eq('doctor_staff_id', doctorStaffId)
        .eq('coach_staff_id', staff.id)
        .maybeSingle();
      if (error) {
        console.error('[CoachBaseline] Assessment fetch error:', error);
        throw error;
      }
      console.log('[CoachBaseline] Assessment result:', data?.id, data?.status);
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
      const DOMAIN_ORDER = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'];
      const allDomains = Array.from(domainMap.values());
      allDomains.sort((a, b) => {
        const ai = DOMAIN_ORDER.indexOf(a.domain_name);
        const bi = DOMAIN_ORDER.indexOf(b.domain_name);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      return allDomains;
    },
  });

  // Get flat list of all action_ids for "first pro move" logic
  const allActionIds = domains?.flatMap(d => d.proMoves.map(pm => pm.action_id)) ?? [];

  // When recording stops, clear highlight
  useEffect(() => {
    if (!recState.isRecording) {
      setActiveActionId(null);
      setPillAnchorTop(null);
    }
  }, [recState.isRecording]);

  useEffect(() => {
    if (existingAssessment?.id) {
      setAssessmentId(existingAssessment.id);
      if (existingAssessment.status === 'completed') setIsComplete(true);
      if (existingAssessment.recording_transcript) setTranscript(existingAssessment.recording_transcript);
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
      // Snapshot for dirty detection (only set once)
      if (initialSnapshot === null) {
        setInitialSnapshot(JSON.stringify(loaded));
      }
    }
  }, [existingItems]);

  // Create assessment
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!staff?.id) throw new Error('No staff ID');
      console.log('[CoachBaseline] Creating assessment for doctor:', doctorStaffId, 'coach:', staff.id);
      const { data, error } = await supabase
        .from('coach_baseline_assessments')
        .insert({ doctor_staff_id: doctorStaffId, coach_staff_id: staff.id, status: 'in_progress' })
        .select('id')
        .single();
      if (error) {
        console.error('[CoachBaseline] Create error:', error);
        throw error;
      }
      console.log('[CoachBaseline] Created assessment:', data.id);
      return data.id;
    },
    onSuccess: (id) => setAssessmentId(id),
    onError: (e: Error) => {
      console.error('[CoachBaseline] Create mutation failed:', e);
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
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
    onError: (e: Error) => {
      console.error('Failed to save rating:', e);
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
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
      queryClient.invalidateQueries({ queryKey: ['coach-baseline-items-compare'] });
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

  // ── Step 1: Stop recording & transcribe ──
  const handleStopAndTranscribe = useCallback(async () => {
    if (!assessmentId) return;
    setIsTranscribing(true);
    setProcessingStep('Stopping recording...');

    try {
      const blob = await recControls.stopAndGetBlob();
      if (!blob) throw new Error('No audio captured');

      setProcessingStep('Transcribing audio...');
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');

      const { data: transcriptData, error: transcriptErr } = await supabase.functions.invoke('transcribe-audio', { body: formData });
      if (transcriptErr) throw transcriptErr;

      const text = transcriptData?.text || transcriptData?.transcript;
      if (!text) throw new Error('No transcript returned');

      // Save transcript to DB
      const { error: saveErr } = await supabase
        .from('coach_baseline_assessments')
        .update({ recording_transcript: text, updated_at: new Date().toISOString() })
        .eq('id', assessmentId);
      if (saveErr) console.error('Failed to save transcript:', saveErr);

      setTranscript(text);
      setIsTranscriptExpanded(true);
      toast({ title: 'Transcription complete', description: 'Review the transcript below, then map to notes.' });
    } catch (e: any) {
      console.error('Transcription error:', e);
      toast({ title: 'Transcription error', description: e.message, variant: 'destructive' });
    } finally {
      setIsTranscribing(false);
      setProcessingStep('');
    }
  }, [assessmentId, recControls]);

  // ── Step 2: Map transcript to pro-move notes ──
  const handleMapToNotes = useCallback(async () => {
    if (!domains || !assessmentId || !transcript) return;
    setIsMappingNotes(true);
    setProcessingStep('Mapping transcript to notes...');

    try {
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
      if (Object.keys(newNotes).length === 0) {
        toast({ title: 'No notes mapped', description: 'The AI could not identify Pro Move-specific feedback in the transcript.' });
        return;
      }

      // Merge AI notes into ratings and save each
      const updatedRatings = { ...ratings };
      const nowOpenNotes = new Set(openNotes);
      let populatedCount = 0;

      for (const [actionIdStr, noteText] of Object.entries(newNotes)) {
        const actionId = Number(actionIdStr);
        if (isNaN(actionId) || typeof noteText !== 'string' || !noteText.trim()) continue;

        const existing = updatedRatings[actionId] || { score: null, note: '' };
        const mergedNote = existing.note ? `${existing.note}\n---\n${noteText}` : noteText as string;
        updatedRatings[actionId] = { ...existing, note: mergedNote };
        nowOpenNotes.add(actionId);

        // Save to DB with await for reliability
        const { error } = await supabase
          .from('coach_baseline_items')
          .upsert({
            assessment_id: assessmentId,
            action_id: actionId,
            rating: existing.score,
            note_text: mergedNote || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'assessment_id,action_id' });
        
        if (error) {
          console.error(`Failed to save note for action ${actionId}:`, error);
        } else {
          populatedCount++;
        }
      }

      setRatings(updatedRatings);
      setOpenNotes(nowOpenNotes);
      setMappingJustCompleted(true);
      proMoveTimeline.current = [];

      toast({
        title: 'Notes Mapped',
        description: `${populatedCount} Pro Move note${populatedCount !== 1 ? 's' : ''} populated from your recording.`,
      });
    } catch (e: any) {
      console.error('Mapping error:', e);
      toast({ title: 'Mapping error', description: e.message, variant: 'destructive' });
    } finally {
      setIsMappingNotes(false);
      setProcessingStep('');
    }
  }, [domains, assessmentId, transcript, ratings, openNotes]);

  // Start over / delete recording
  const handleStartOver = useCallback(() => {
    recControls.stopAndGetBlob(); // discard
    proMoveTimeline.current = [];
    setActiveActionId(null);
    setTranscript(null);
    setMappingJustCompleted(false);
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
    if (!recState.isRecording) return undefined;
    if (!activeActionId || !domains) return 'Tap a Pro Move…';
    for (const d of domains) {
      const pm = d.proMoves.find(p => p.action_id === activeActionId);
      if (pm) return pm.action_statement.slice(0, 60);
    }
    return 'Tap a Pro Move…';
  };

  if (domainsLoading || !domains) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Dirty detection: compare current ratings to initial snapshot
  const isDirty = isComplete && initialSnapshot !== null && JSON.stringify(ratings) !== initialSnapshot;

  // Re-save handler for completed assessments with changes
  const handleResave = useCallback(() => {
    // Update the assessment's updated_at
    if (assessmentId) {
      supabase
        .from('coach_baseline_assessments')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', assessmentId)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['coach-baseline-assessment'] });
          queryClient.invalidateQueries({ queryKey: ['coach-baseline-items-compare'] });
          setInitialSnapshot(JSON.stringify(ratings));
          toast({ title: 'Changes saved', description: 'Your updated assessment has been saved.' });
        });
    }
    setShowSaveConfirm(false);
  }, [assessmentId, ratings, queryClient, toast]);

  const totalProMoves = domains.reduce((sum, d) => sum + d.proMoves.length, 0);
  const ratedCount = Object.values(ratings).filter(r => r.score !== null).length;
  const progressPct = totalProMoves > 0 ? Math.round((ratedCount / totalProMoves) * 100) : 0;
  const allRated = ratedCount === totalProMoves;

  const isProcessing = isTranscribing || isMappingNotes;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" onClick={onBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" /> Back to Doctor Detail
      </Button>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">
            {isComplete ? 'Review Assessment' : 'Private Assessment'}: {doctorName}
          </h1>
          {isComplete && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              <CheckCircle2 className="h-3 w-3" /> Complete
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {isComplete
            ? 'You can review and update ratings or notes. Changes will require confirmation before saving.'
            : 'Rate each Pro Move and optionally record verbal feedback. This is visible only to clinical directors.'}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{domains.length} domains</span>
          <span>{ratedCount} of {totalProMoves} Pro Moves rated</span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      {/* Start Recording — at top, before domains */}
      {!recState.isRecording && !isProcessing && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Record Verbal Feedback</p>
                <p className="text-xs text-muted-foreground">
                  {transcript
                    ? 'You have a previous transcript. Start a new recording or scroll down to re-map it.'
                    : 'Tap a Pro Move card, then speak your feedback. Tap the next card when you move on.'}
                </p>
              </div>
              <Button
                onClick={() => {
                  proMoveTimeline.current = [];
                  setTranscript(null);
                  setMappingJustCompleted(false);
                  recControls.startRecording();
                }}
                variant="outline"
                className="gap-2"
              >
                <Mic className="h-4 w-4" />
                {transcript ? 'New Recording' : 'Start Recording'}
              </Button>
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
          anchorTop={pillAnchorTop}
        />
      )}

      {/* All domains — scrollable */}
      {domains.map(domain => {
        const domainColor = domain.color_hex || 'hsl(var(--primary))';
        return (
        <div key={domain.domain_id} className="rounded-lg border overflow-hidden space-y-0">
          {/* Domain header with tinted background */}
          <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: `${domainColor}15` }}>
            <div
              className="w-5 h-5 rounded-full shrink-0"
              style={{ backgroundColor: domainColor }}
            />
            <h3 className="text-lg font-bold">{domain.domain_name}</h3>
            <span className="text-sm text-muted-foreground ml-auto">
              {domain.proMoves.filter(pm => ratings[pm.action_id]?.score != null).length}/{domain.proMoves.length} rated
            </span>
          </div>

          {/* Pro Move ratings */}
          <div className="p-4 space-y-2">
            {domain.proMoves.map(pm => {
              const r = ratings[pm.action_id] || { score: null, note: '' };
              const isActive = recState.isRecording && activeActionId === pm.action_id;
              const noteIsOpen = openNotes.has(pm.action_id);

              return (
                <div
                  key={pm.action_id}
                  ref={el => { if (el) proMoveRefs.current.set(pm.action_id, el); }}
                  data-action-id={pm.action_id}
                  onClick={() => handleCardTap(pm.action_id)}
                  className={cn(
                    "border rounded-md p-3 space-y-2 transition-all duration-300",
                    recState.isRecording && !isActive && "border-dashed border-muted-foreground/40 cursor-pointer hover:border-primary/50 hover:bg-muted/30"
                  )}
                  style={isActive ? {
                    borderColor: domainColor,
                    boxShadow: `0 0 12px ${domainColor}4D`,
                    outline: `3px solid ${domainColor}`,
                    outlineOffset: '-1px',
                  } : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{pm.action_statement}</p>
                      <p className="text-xs text-muted-foreground">{pm.competency_name}</p>
                    </div>
                  </div>

                  {/* Rating buttons — circular, semantic colors matching doctor wizard */}
                  <div className="flex gap-2">
                    {SCORE_CONFIG.map(({ value, selected }) => (
                      <button
                        key={value}
                        onClick={(e) => { e.stopPropagation(); handleRatingChange(pm.action_id, r.score === value ? null : value); }}
                        className={cn(
                          "w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-medium transition-all",
                          r.score === value
                            ? selected
                            : "border-muted-foreground/30 hover:border-primary/50"
                        )}
                      >
                        {value}
                      </button>
                    ))}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRatingChange(pm.action_id, r.score === 0 ? null : 0); }}
                      className={cn(
                        "w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-medium transition-all",
                        r.score === 0
                          ? "bg-muted border-muted-foreground text-foreground"
                          : "border-muted-foreground/30 hover:border-primary/50 text-muted-foreground"
                      )}
                    >
                      N/A
                    </button>
                  </div>

                  {/* Collapsible note */}
                  <Collapsible open={noteIsOpen} onOpenChange={() => toggleNoteOpen(pm.action_id)}>
                    <CollapsibleTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronDown className={cn("h-3 w-3 transition-transform", noteIsOpen && "rotate-180")} />
                        {r.note ? 'View note' : 'Add note'}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <Textarea
                        value={r.note}
                        onChange={(e) => handleNoteChange(pm.action_id, e.target.value)}
                        onBlur={() => handleNoteBlur(pm.action_id)}
                        onClick={(e) => e.stopPropagation()}
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
        );
      })}

      {/* ── Non-recording bottom section: transcript and complete ── */}
      {!recState.isRecording && (
        <div className="space-y-4 pt-4 border-t">
          {/* Processing indicator */}
          {isProcessing && (
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center gap-3 justify-center py-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">{processingStep}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Transcript display + Map to Notes */}
          {transcript && !isProcessing && (
            <Card>
              <CardContent className="py-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Transcript</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsTranscriptExpanded(!isTranscriptExpanded)}
                    >
                      {isTranscriptExpanded ? 'Collapse' : 'Expand'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setTranscript(null); setMappingJustCompleted(false); }}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      New Recording
                    </Button>
                  </div>
                </div>

                {isTranscriptExpanded && (
                  <Textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    onBlur={async () => {
                      if (assessmentId && transcript) {
                        await supabase
                          .from('coach_baseline_assessments')
                          .update({ recording_transcript: transcript, updated_at: new Date().toISOString() })
                          .eq('id', assessmentId);
                      }
                    }}
                    className="bg-muted/30 border rounded-md p-3 text-sm max-h-[300px] min-h-[100px] overflow-y-auto resize-y"
                    placeholder="Edit transcript..."
                  />
                )}

                {!mappingJustCompleted && (
                  <Button
                    onClick={handleMapToNotes}
                    disabled={isMappingNotes}
                    className="w-full gap-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Map to Pro Move Notes
                  </Button>
                )}

                {mappingJustCompleted && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 justify-center py-1">
                    <CheckCircle2 className="h-4 w-4" />
                    Notes mapped successfully
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setMappingJustCompleted(false); }}
                      className="ml-2 text-xs"
                    >
                      Re-map
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Complete / Save Changes */}
          {!isProcessing && (
            <div className="flex items-center justify-end gap-3">
              {isComplete && isDirty && (
                <p className="text-sm text-muted-foreground">You have unsaved changes</p>
              )}
              {isComplete ? (
                <Button
                  onClick={() => isDirty ? setShowSaveConfirm(true) : onBack()}
                  size="lg"
                  variant={isDirty ? 'default' : 'outline'}
                  className="shadow-lg"
                >
                  {isDirty ? 'Save Changes' : 'Back to Detail'}
                </Button>
              ) : (
                <Button
                  onClick={() => completeMutation.mutate()}
                  disabled={!allRated || completeMutation.isPending}
                  size="lg"
                  className="shadow-lg"
                >
                  {completeMutation.isPending ? 'Saving…' : allRated ? 'Complete Assessment' : `${ratedCount}/${totalProMoves} rated`}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Sticky footer: Stop & Transcribe (visible while recording) ── */}
      {recState.isRecording && (
        <div className="sticky bottom-0 z-30 -mx-6 px-6 py-3 bg-background/95 backdrop-blur border-t shadow-lg">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-sm font-medium">Recording in progress</span>
            </div>
            <Button
              variant="destructive"
              onClick={handleStopAndTranscribe}
              className="gap-2"
            >
              <MicOff className="h-4 w-4" />
              Stop & Transcribe
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation dialog for saving changes to completed assessment */}
      <AlertDialog open={showSaveConfirm} onOpenChange={setShowSaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save changes?</AlertDialogTitle>
            <AlertDialogDescription>
              It looks like you've updated some ratings or notes. Are you sure you want to save these changes?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResave}>Save Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
