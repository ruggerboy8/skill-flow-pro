import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2, CalendarIcon, Upload, Mic, FileAudio, Download, X, Loader2, FileText, Sparkles, ClipboardPaste } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { getDomainColor } from '@/lib/domainColors';
import { supabase } from '@/integrations/supabase/client';
import {
  getEvaluation,
  setObserverScore,
  setObserverNote,
  setSelfScore,
  setSelfNote,
  setObserverNA,
  setSelfNA,
  submitEvaluation,
  deleteEvaluation,
  isEvaluationComplete,
  updateEvaluationMetadata,
  updateSummaryFeedback,
  updateInterviewTranscript,
  updateExtractedInsights,
  type EvaluationWithItems,
  type ExtractedInsights,
  type InsightsPerspective
} from '@/lib/evaluations';
import { ProMovesAccordion } from '@/components/coach/ProMovesAccordion';
import { SummaryTab } from '@/components/coach/SummaryTab';
import { RecordingStartCard } from '@/components/coach/RecordingStartCard';
import { RecordingProcessCard } from '@/components/coach/RecordingProcessCard';
import { FloatingRecorderPill } from '@/components/coach/FloatingRecorderPill';
import { InterviewRecorder } from '@/components/coach/InterviewRecorder';
import { useAudioRecording, type AudioSegment } from '@/hooks/useAudioRecording';
import { transcribeWithChunking, type ChunkProgress, CHUNK_SIZE_BYTES } from '@/lib/audioChunking';
import { useSidebar } from '@/components/ui/sidebar';
import ReactQuill from 'react-quill';

const SCORE_OPTIONS = [
  { value: 1, label: '1 - Needs Development', color: 'bg-red-100 text-red-800 border-red-200' },
  { value: 2, label: '2 - Developing', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 3, label: '3 - Proficient', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 4, label: '4 - Advanced', color: 'bg-green-100 text-green-800 border-green-200' }
];

export function EvaluationHub() {
  const { staffId, evalId } = useParams<{ staffId: string; evalId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  const [evaluation, setEvaluation] = useState<EvaluationWithItems | null>(null);
  const [staffName, setStaffName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get('phase') === 'self' ? 'self-assessment' : 'observation');
  const [currentSelfIndex, setCurrentSelfIndex] = useState(0);
  const [showObserverNotes, setShowObserverNotes] = useState<Record<number, boolean>>({});
  const [showSelfNote, setShowSelfNote] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingObserverNotes, setPendingObserverNotes] = useState<Record<number, string>>({});
  const [pendingSelfNotes, setPendingSelfNotes] = useState<Record<number, string>>({});
  const [editType, setEditType] = useState<string>('');
  const [editQuarter, setEditQuarter] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<Date | undefined>();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [currentRecording, setCurrentRecording] = useState<{
    path: string;
    name: string;
    size: number;
    uploaded_at: string;
  } | null>(null);
  const [summaryFeedback, setSummaryFeedback] = useState<string | null>(null);
  const [summaryRawTranscript, setSummaryRawTranscript] = useState<string | null>(null);
  const [interviewTranscript, setInterviewTranscript] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const [isObservationTranscriptExpanded, setIsObservationTranscriptExpanded] = useState(false);
  const [draftObservationAudioPath, setDraftObservationAudioPath] = useState<string | null>(null);
  const [draftInterviewAudioPath, setDraftInterviewAudioPath] = useState<string | null>(null);
  const [showNaConfirmDialog, setShowNaConfirmDialog] = useState(false);
  
  // Interview-specific recording flow states (mirrors observation flow)
  const [isTranscribingInterview, setIsTranscribingInterview] = useState(false);
  const [transcriptionJustCompletedInterview, setTranscriptionJustCompletedInterview] = useState(false);
  const [analysisJustCompletedInterview, setAnalysisJustCompletedInterview] = useState(false);
  
  // Paste transcript dialog state
  const [showPasteTranscriptDialog, setShowPasteTranscriptDialog] = useState(false);
  const [pastedTranscript, setPastedTranscript] = useState('');

  // Recording state for split recording UI
  const [restoredAudioUrl, setRestoredAudioUrl] = useState<string | null>(null);
  const [restoredAudioBlob, setRestoredAudioBlob] = useState<Blob | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isTranscribingObservation, setIsTranscribingObservation] = useState(false);
  const [isAnalyzingObservation, setIsAnalyzingObservation] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [showFloatingPill, setShowFloatingPill] = useState(false);
  const [isMappingToNotes, setIsMappingToNotes] = useState(false);
  const [mappingJustCompleted, setMappingJustCompleted] = useState(false);
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress | null>(null);
  const startCardRef = useRef<HTMLDivElement>(null);
  const processSectionRef = useRef<HTMLDivElement>(null);
  const transcriptSectionRef = useRef<HTMLDivElement>(null);
  
  // Segment transcript tracking for large recordings
  const [segmentTranscripts, setSegmentTranscripts] = useState<string[]>([]);

  // Viewport tracking for competency-aware recording
  const [activeCompetencyId, setActiveCompetencyId] = useState<number | null>(null);
  const [competencyTimeline, setCompetencyTimeline] = useState<{ competency_id: number; t_start_ms: number }[]>([]);
  const rowRefs = useRef(new Map<number, HTMLElement>());
  const recordingStartTimeRef = useRef<number>(0);
  // debounceTimerRef and activeCompetencyIdRef removed — click-to-select model
  const { setOpen: setSidebarOpen } = useSidebar();

  // Segment upload callback for observer notes
  const handleObserverSegmentReady = useCallback(async (segment: AudioSegment) => {
    console.log(`[EvaluationHub] Segment ${segment.index} ready, transcribing...`);
    try {
      const formData = new FormData();
      formData.append('audio', segment.blob, `segment-${segment.index}.webm`);
      
      const response = await supabase.functions.invoke('transcribe-audio', {
        body: formData,
      });
      
      if (response.error) {
        console.error(`[EvaluationHub] Segment ${segment.index} transcription failed:`, response.error);
        // Store empty string to maintain index alignment
        setSegmentTranscripts(prev => {
          const updated = [...prev];
          updated[segment.index] = '';
          return updated;
        });
        return;
      }
      
      const transcript = response.data?.transcript || '';
      console.log(`[EvaluationHub] Segment ${segment.index} transcribed: ${transcript.length} chars`);
      
      setSegmentTranscripts(prev => {
        const updated = [...prev];
        updated[segment.index] = transcript;
        return updated;
      });
      
      toast({
        title: `Segment ${segment.index + 1} saved`,
        description: `${(segment.blob.size / (1024 * 1024)).toFixed(1)}MB transcribed`,
      });
    } catch (error) {
      console.error(`[EvaluationHub] Segment ${segment.index} error:`, error);
      setSegmentTranscripts(prev => {
        const updated = [...prev];
        updated[segment.index] = '';
        return updated;
      });
    }
  }, [toast]);

  // Audio recording state - lifted here so it persists across tab switches
  const { state: recordingState, controls: recordingControls } = useAudioRecording({
    enableSegmentation: true,
    onSegmentReady: handleObserverSegmentReady,
  });

  useEffect(() => {
    if (evalId) {
      loadEvaluation();
    }
  }, [evalId]);

  // Initialize note visibility when evaluation loads - show notes that have content
  useEffect(() => {
    if (evaluation) {
      // Show observer notes that have content (for both draft and submitted)
      const observerNotesToShow: Record<number, boolean> = {};
      evaluation.items.forEach(item => {
        if (item.observer_note && item.observer_note.trim()) {
          observerNotesToShow[item.competency_id] = true;
        }
        // Auto-show notes for low scores
        if (item.observer_score !== null && item.observer_score <= 2) {
          observerNotesToShow[item.competency_id] = true;
        }
      });
      setShowObserverNotes(observerNotesToShow);

      // Show self note if it has content (check current index)
      const sortedItems = evaluation.items.sort((a, b) => a.competency_id - b.competency_id);
      const currentItem = sortedItems[currentSelfIndex];
      if (currentItem && currentItem.self_note && currentItem.self_note.trim()) {
        setShowSelfNote(true);
      }
    }
  }, [evaluation, currentSelfIndex]);

  // Load draft audio on mount if path exists
  useEffect(() => {
    if (draftObservationAudioPath && !restoredAudioUrl && !recordingState.audioBlob) {
      loadDraftAudio(draftObservationAudioPath);
    }
  }, [draftObservationAudioPath]);

  // Auto-save audio blob to storage when recording stops
  useEffect(() => {
    if (recordingState.audioBlob && !recordingState.isRecording && !isSavingDraft) {
      saveDraftAudio(recordingState.audioBlob);
    }
  }, [recordingState.audioBlob, recordingState.isRecording]);

  // Cleanup audio URL on unmount
  useEffect(() => {
    return () => {
      if (restoredAudioUrl) {
        URL.revokeObjectURL(restoredAudioUrl);
      }
    };
  }, [restoredAudioUrl]);

  // IntersectionObserver for floating recorder pill visibility
  useEffect(() => {
    if (!recordingState.isRecording) {
      setShowFloatingPill(false);
      return;
    }
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show pill when start card is out of view AND recording is active
        setShowFloatingPill(!entry.isIntersecting);
      },
      { threshold: 0.9 }
    );
    
    if (startCardRef.current) {
      observer.observe(startCardRef.current);
    }
    
    return () => observer.disconnect();
  }, [recordingState.isRecording]);

  // Auto-collapse sidebar when recording starts + track recording start time
  useEffect(() => {
    if (recordingState.isRecording) {
      setSidebarOpen(false);
      if (recordingStartTimeRef.current === 0) {
        recordingStartTimeRef.current = Date.now();
        setCompetencyTimeline([]);
        setActiveCompetencyId(null);
      }
    } else {
      recordingStartTimeRef.current = 0;
    }
  }, [recordingState.isRecording, setSidebarOpen]);

  // Click-to-select handler for competency-aware recording
  const handleCompetencyTap = useCallback((competencyId: number) => {
    if (!recordingState.isRecording || recordingStartTimeRef.current === 0) return;

    const elapsed = Date.now() - recordingStartTimeRef.current;
    const newId = activeCompetencyId === competencyId ? null : competencyId;
    setActiveCompetencyId(newId);
    setCompetencyTimeline(prev => [...prev, {
      competency_id: newId ?? 0,
      t_start_ms: elapsed,
    }]);
  }, [recordingState.isRecording, activeCompetencyId]);

  // Scroll to process section when "Done?" is clicked
  const scrollToProcessSection = useCallback(() => {
    processSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Check if any observer notes exist (for "Re-record" vs "Start" label)
  const hasExistingObserverNotes = React.useMemo(() => {
    if (!evaluation) return false;
    return evaluation.items.some(item => item.observer_note && item.observer_note.trim());
  }, [evaluation]);

  // Get active competency label for display in recorder UI
  const activeCompetencyLabel = React.useMemo(() => {
    if (activeCompetencyId == null || !evaluation) return undefined;
    const item = evaluation.items.find(i => i.competency_id === activeCompetencyId);
    return item?.competency_name_snapshot || undefined;
  }, [activeCompetencyId, evaluation]);

  // Handler for scrolling to transcript section
  const handleScrollToTranscript = useCallback(() => {
    transcriptSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const loadDraftAudio = async (path: string) => {
    setIsLoadingDraft(true);
    try {
      const { data, error } = await supabase.storage
        .from('evaluation-recordings')
        .download(path);
      
      if (error) throw error;
      
      const url = URL.createObjectURL(data);
      setRestoredAudioUrl(url);
      setRestoredAudioBlob(data);
      
      console.log('[EvaluationHub] Draft audio loaded from:', path);
    } catch (error) {
      console.error('[EvaluationHub] Failed to load draft audio:', error);
    } finally {
      setIsLoadingDraft(false);
    }
  };

  const saveDraftAudio = async (blob: Blob) => {
    if (!evalId) return;
    setIsSavingDraft(true);
    try {
      const fileName = `${evalId}/draft-observation-${Date.now()}.webm`;
      
      const { error: uploadError } = await supabase.storage
        .from('evaluation-recordings')
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: true
        });
      
      if (uploadError) throw uploadError;
      
      // Update database with draft path
      handleDraftAudioSaved(fileName);
      
      console.log('[EvaluationHub] Draft audio saved to:', fileName);
    } catch (error) {
      console.error('[EvaluationHub] Failed to save draft audio:', error);
      toast({
        title: 'Warning',
        description: 'Could not auto-save recording. Please process it before leaving.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const deleteDraftAudio = async (path: string) => {
    try {
      await supabase.storage
        .from('evaluation-recordings')
        .remove([path]);
      console.log('[EvaluationHub] Draft audio deleted:', path);
    } catch (error) {
      console.error('[EvaluationHub] Failed to delete draft audio:', error);
    }
  };

  // Step 2: Transcribe audio only (no insight extraction)
  const handleTranscribeObservation = async (audioBlob: Blob) => {
    if (!evalId) return;
    
    setIsTranscribingObservation(true);
    setProcessingStep('Transcribing audio...');

    try {
      // Concatenate any prior segment transcripts with final segment
      let rawTranscript: string;
      
      if (segmentTranscripts.length > 0) {
        // We have prior segments - transcribe final segment and concatenate
        console.log(`[EvaluationHub] Concatenating ${segmentTranscripts.length} prior segments with final`);
        setProcessingStep(`Transcribing final segment...`);
        
        const formData = new FormData();
        formData.append('audio', audioBlob, 'recording.webm');
        
        const transcribeResponse = await supabase.functions.invoke('transcribe-audio', {
          body: formData,
        });
        
        if (transcribeResponse.error) {
          throw new Error(transcribeResponse.error.message || 'Transcription failed');
        }
        
        const finalTranscript = transcribeResponse.data?.transcript || '';
        
        // Concatenate all segments in order
        rawTranscript = [...segmentTranscripts, finalTranscript]
          .filter(Boolean)
          .join(' ');
        
        console.log(`[EvaluationHub] Combined transcript from ${segmentTranscripts.length + 1} segments: ${rawTranscript.length} chars`);
        
        // Clear segment transcripts
        setSegmentTranscripts([]);
      } else {
        // No prior segments - use chunking utility for large files
        setProcessingStep('Transcribing audio...');
        
        const result = await transcribeWithChunking(audioBlob, (progress) => {
          if (progress.phase === 'transcribing' && progress.totalChunks > 1) {
            setProcessingStep(`Transcribing chunk ${progress.currentChunk} of ${progress.totalChunks}...`);
          }
          setChunkProgress(progress);
        });
        
        rawTranscript = result.transcript;
        
        if (result.chunked) {
          console.log(`[EvaluationHub] Large file transcribed in ${result.totalChunks} chunks`);
        }
      }
      
      if (!rawTranscript) {
        throw new Error('No transcript returned');
      }
      
      setChunkProgress(null);

      // Step 2: Format transcript for readability
      setProcessingStep('Formatting transcript...');

      const formatResponse = await supabase.functions.invoke('format-transcript', {
        body: { transcript: rawTranscript, source: 'observation' },
      });

      // Use formatted transcript if available, fallback to raw
      const transcript = formatResponse.data?.formatted || rawTranscript;

      // Save transcript to database
      handleSummaryTranscriptChange(transcript);

      // Delete draft audio after successful transcription
      if (draftObservationAudioPath) {
        await deleteDraftAudio(draftObservationAudioPath);
        handleDraftAudioCleared();
      }

      // Reset recording state after successful transcription
      recordingControls.resetRecording();
      
      // Clear restored audio state
      if (restoredAudioUrl) {
        URL.revokeObjectURL(restoredAudioUrl);
        setRestoredAudioUrl(null);
        setRestoredAudioBlob(null);
      }

      // Auto-expand transcript for reference
      setIsObservationTranscriptExpanded(true);
      
      return transcript;
    } catch (error) {
      console.error('[EvaluationHub] Transcription error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to transcribe audio',
        variant: 'destructive',
      });
    } finally {
      setIsTranscribingObservation(false);
      setProcessingStep('');
    }
  };

  // Map transcript to per-competency notes via AI
  const handleMapToNotes = async (transcriptOverride?: string) => {
    const transcriptToMap = transcriptOverride || summaryRawTranscript;
    if (!evalId || !transcriptToMap || !evaluation) return;
    
    setIsMappingToNotes(true);
    setProcessingStep('Mapping transcript to notes...');

    try {
      const competencies = evaluation.items.map(item => ({
        id: item.competency_id,
        name: item.competency_name_snapshot,
        domain: item.domain_name || 'General',
      }));

      const response = await supabase.functions.invoke('map-observation-notes', {
        body: { 
          transcript: transcriptToMap, 
          timeline: competencyTimeline,
          competencies,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Mapping failed');
      }

      const notes = response.data?.notes as Array<{ competency_id: number; note_text: string }>;
      if (!notes || notes.length === 0) {
        toast({
          title: 'No Notes Mapped',
          description: 'The AI could not identify competency-specific feedback in the transcript.',
        });
        return;
      }

      // Populate each competency's observer_note
      let populatedCount = 0;
      for (const { competency_id, note_text } of notes) {
        const existingNote = pendingObserverNotes[competency_id] ?? 
          evaluation.items.find(i => i.competency_id === competency_id)?.observer_note ?? '';
        
        const finalNote = existingNote.trim() 
          ? `${existingNote.trim()}\n---\n${note_text}` 
          : note_text;

        // Update local state immediately
        setPendingObserverNotes(prev => ({ ...prev, [competency_id]: finalNote }));
        setShowObserverNotes(prev => ({ ...prev, [competency_id]: true }));
        
        // Persist to DB
        await handleObserverNoteChange(competency_id, finalNote);
        populatedCount++;
      }

      setMappingJustCompleted(true);

      toast({
        title: 'Notes Mapped',
        description: `${populatedCount} competency note${populatedCount !== 1 ? 's' : ''} populated from your observation.`,
      });
    } catch (error) {
      console.error('[EvaluationHub] Mapping error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to map transcript to notes',
        variant: 'destructive',
      });
    } finally {
      setIsMappingToNotes(false);
      setProcessingStep('');
    }
  };

  // Combined handler: stop recording, transcribe, and auto-map to notes
  const handleFinishAndTranscribe = async () => {
    // Stop the recording and get blob directly (avoids stale closure)
    const audioBlob = await recordingControls.stopAndGetBlob();
    
    if (audioBlob) {
      const transcript = await handleTranscribeObservation(audioBlob);
      if (transcript) {
        await handleMapToNotes(transcript);
      }
    }
  };

  const handleDiscardRestoredAudio = async () => {
    if (draftObservationAudioPath) {
      await deleteDraftAudio(draftObservationAudioPath);
      handleDraftAudioCleared();
    }
    if (restoredAudioUrl) {
      URL.revokeObjectURL(restoredAudioUrl);
    }
    setRestoredAudioUrl(null);
    setRestoredAudioBlob(null);
  };

  const loadEvaluation = async () => {
    if (!evalId) return;
    
    try {
      setLoading(true);
      const data = await getEvaluation(evalId);
      if (!data) {
        toast({
          title: "Error",
          description: "Evaluation not found",
          variant: "destructive"
        });
        navigate(`/coach/${staffId}`);
        return;
      }
      setEvaluation(data);

      // Fetch staff information
      const { data: staffData } = await supabase
        .from('staff')
        .select('name')
        .eq('id', data.staff_id)
        .single();
      
      if (staffData) {
        setStaffName(staffData.name);
      }

      // Initialize edit fields
      setEditType(data.type);
      setEditQuarter(data.quarter);
      setEditDate(data.observed_at ? new Date(data.observed_at) : undefined);

      // Initialize summary fields
      setSummaryFeedback((data as any).summary_feedback || null);
      setSummaryRawTranscript((data as any).summary_raw_transcript || null);
      setInterviewTranscript((data as any).interview_transcript || null);
      setDraftObservationAudioPath((data as any).draft_observation_audio_path || null);
      setDraftInterviewAudioPath((data as any).draft_interview_audio_path || null);

      // Load audio recording if exists
      if (data.audio_recording_path) {
        await loadCurrentRecording(data.audio_recording_path);
      }
    } catch (error) {
      console.error('Failed to load evaluation:', error);
      toast({
        title: "Error",
        description: "Failed to load evaluation",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleObserverScoreChange = async (competencyId: number, score: number | null) => {
    if (!evalId) return;
    
    try {
      setSaving(true);
      await setObserverScore(evalId, competencyId, score);
      
      // Update local state - also clear NA flag when setting a score
      setEvaluation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item => 
            item.competency_id === competencyId 
              ? { ...item, observer_score: score, observer_is_na: false }
              : item
          )
        };
      });

      // Auto-show note field for low scores
      if (score !== null && score <= 2) {
        setShowObserverNotes(prev => ({ ...prev, [competencyId]: true }));
      }

      toast({
        title: "Saved",
        description: "Observer score updated",
        variant: "default"
      });
    } catch (error) {
      console.error('Failed to update observer score:', error);
      toast({
        title: "Error",
        description: "Failed to save score",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleObserverNAChange = async (competencyId: number, isNA: boolean) => {
    if (!evalId) return;
    
    try {
      setSaving(true);
      await setObserverNA(evalId, competencyId, isNA);
      
      // Update local state
      setEvaluation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item => 
            item.competency_id === competencyId 
              ? { ...item, observer_is_na: isNA, observer_score: isNA ? null : item.observer_score }
              : item
          )
        };
      });

      toast({
        title: "Saved",
        description: isNA ? "Marked as Not Observed" : "N/A cleared",
        variant: "default"
      });
    } catch (error) {
      console.error('Failed to update observer NA:', error);
      toast({
        title: "Error",
        description: "Failed to update",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleObserverNoteChange = async (competencyId: number, note: string) => {
    if (!evalId) return;
    
    try {
      await setObserverNote(evalId, competencyId, note);
      
      // Update local state
      setEvaluation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item => 
            item.competency_id === competencyId 
              ? { ...item, observer_note: note }
              : item
          )
        };
      });
    } catch (error) {
      console.error('Failed to update observer note:', error);
      toast({
        title: "Error",
        description: "Failed to save note",
        variant: "destructive"
      });
    }
  };

  const handleSelfScoreChange = async (competencyId: number, score: number | null) => {
    if (!evalId) return;
    
    try {
      setSaving(true);
      await setSelfScore(evalId, competencyId, score);
      
      // Update local state - also clear NA flag when setting a score
      setEvaluation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item => 
            item.competency_id === competencyId 
              ? { ...item, self_score: score, self_is_na: false }
              : item
          )
        };
      });

      toast({
        title: "Saved",
        description: "Self-assessment score updated",
        variant: "default"
      });
    } catch (error) {
      console.error('Failed to update self score:', error);
      toast({
        title: "Error",
        description: "Failed to save score",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSelfNAChange = async (competencyId: number, isNA: boolean) => {
    if (!evalId) return;
    
    try {
      setSaving(true);
      await setSelfNA(evalId, competencyId, isNA);
      
      // Update local state
      setEvaluation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item => 
            item.competency_id === competencyId 
              ? { ...item, self_is_na: isNA, self_score: isNA ? null : item.self_score }
              : item
          )
        };
      });

      toast({
        title: "Saved",
        description: isNA ? "Marked as Not Observed" : "N/A cleared",
        variant: "default"
      });
    } catch (error) {
      console.error('Failed to update self NA:', error);
      toast({
        title: "Error",
        description: "Failed to update",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSelfNoteChange = async (competencyId: number, note: string) => {
    if (!evalId) return;
    
    try {
      await setSelfNote(evalId, competencyId, note);
      
      // Update local state
      setEvaluation(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map(item => 
            item.competency_id === competencyId 
              ? { ...item, self_note: note }
              : item
          )
        };
      });
    } catch (error) {
      console.error('Failed to update self note:', error);
      toast({
        title: "Error",
        description: "Failed to save note",
        variant: "destructive"
      });
    }
  };

  const handleSubmitClick = async () => {
    if (!evaluation) return;
    await flushAllPendingNotes();

    // Re-check completion after flushing notes — merge pending notes into local items for validation
    const itemsWithPending = evaluation.items.map(item => {
      const pending = pendingObserverNotes[item.competency_id];
      if (pending !== undefined) {
        return { ...item, observer_note: pending };
      }
      return item;
    });
    const missingNoteItems = itemsWithPending.filter(
      item => item.observer_score !== null && item.observer_score <= 2 && (!item.observer_note || item.observer_note.trim() === '')
    );
    if (missingNoteItems.length > 0) {
      const names = missingNoteItems.map(i => i.competency_name_snapshot).join(', ');
      toast({
        title: "Notes required",
        description: `Please add observer notes for: ${names}`,
        variant: "destructive"
      });
      return;
    }
    
    if (completionStatus.naCount > 0) {
      setShowNaConfirmDialog(true);
    } else {
      handleSubmitEvaluation();
    }
  };

  const handleSubmitEvaluation = async () => {
    if (!evalId || !evaluation || !user) return;

    try {
      setIsSubmitting(true);
      setShowNaConfirmDialog(false);

      await submitEvaluation(evalId);

      toast({
        title: "Evaluation submitted",
        description: `Release ${staffName || 'the staff member'}'s results from the Delivery tab when ready.`,
        variant: "default"
      });

      // Return coach to the staff hub list, not the staff-facing eval view.
      navigate(`/coach/${staffId}`);
    } catch (error) {
      console.error('Failed to submit evaluation:', error);
      toast({
        title: "Error",
        description: "Failed to submit evaluation",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteEvaluation = async () => {
    if (!evalId) return;
    
    try {
      setIsDeleting(true);
      await deleteEvaluation(evalId);
      
      toast({
        title: "Success",
        description: "Evaluation deleted successfully",
        variant: "default"
      });

      // Navigate back to staff detail page
      navigate(`/coach/${staffId}`);
    } catch (error) {
      console.error('Failed to delete evaluation:', error);
      toast({
        title: "Error",
        description: "Failed to delete evaluation",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleTypeChange = async (newType: string) => {
    if (!evalId) return;
    
    try {
      setEditType(newType);
      
      // If changing to non-Quarterly, clear quarter
      const updateData: { type: string; quarter?: null } = { type: newType };
      if (newType !== 'Quarterly') {
        updateData.quarter = null;
        setEditQuarter(null);
      }
      
      await updateEvaluationMetadata(evalId, updateData);
      
      setEvaluation(prev => prev ? { 
        ...prev, 
        type: newType,
        quarter: newType !== 'Quarterly' ? null : prev.quarter
      } : prev);
      
      toast({
        title: "Saved",
        description: "Evaluation type updated",
        variant: "default"
      });
    } catch (error) {
      console.error('Failed to update evaluation type:', error);
      toast({
        title: "Error",
        description: "Failed to update type",
        variant: "destructive"
      });
    }
  };

  const handleQuarterChange = async (newQuarter: string) => {
    if (!evalId) return;
    
    try {
      setEditQuarter(newQuarter);
      await updateEvaluationMetadata(evalId, { quarter: newQuarter });
      
      setEvaluation(prev => prev ? { ...prev, quarter: newQuarter } : prev);
      
      toast({
        title: "Saved",
        description: "Quarter updated",
        variant: "default"
      });
    } catch (error) {
      console.error('Failed to update quarter:', error);
      toast({
        title: "Error",
        description: "Failed to update quarter",
        variant: "destructive"
      });
    }
  };

  const handleDateChange = async (newDate: Date | undefined) => {
    if (!evalId) return;
    
    try {
      setEditDate(newDate);
      await updateEvaluationMetadata(evalId, { 
        observed_at: newDate?.toISOString() 
      });
      
      setEvaluation(prev => prev ? { 
        ...prev, 
        observed_at: newDate?.toISOString() || null 
      } : prev);
      
      toast({
        title: "Saved",
        description: "Observation date updated",
        variant: "default"
      });
    } catch (error) {
      console.error('Failed to update observation date:', error);
      toast({
        title: "Error",
        description: "Failed to update date",
        variant: "destructive"
      });
    }
  };

  const draftObserverNote = (competencyId: number, text: string) => {
    setPendingObserverNotes(prev => ({ ...prev, [competencyId]: text }));
  };

  const draftSelfNote = (competencyId: number, text: string) => {
    setPendingSelfNotes(prev => ({ ...prev, [competencyId]: text }));
  };

  // Save a single observer note (used onBlur)
  const saveOneObserverNote = async (competencyId: number) => {
    if (!evalId) return;
    const text = pendingObserverNotes[competencyId];
    if (text === undefined) return;
    await setObserverNote(evalId, competencyId, text.trim());
    setEvaluation(prev => prev ? ({
      ...prev,
      items: prev.items.map(it => it.competency_id === competencyId ? { ...it, observer_note: text.trim() } : it)
    }) : prev);
  };

  // Save a single self note (used onBlur)
  const saveOneSelfNote = async (competencyId: number) => {
    if (!evalId) return;
    const text = pendingSelfNotes[competencyId];
    if (text === undefined) return;
    await setSelfNote(evalId, competencyId, text.trim());
    setEvaluation(prev => prev ? ({
      ...prev,
      items: prev.items.map(it => it.competency_id === competencyId ? { ...it, self_note: text.trim() } : it)
    }) : prev);
  };

  // Flush *all* pending notes (call this right before submit)
  const flushAllPendingNotes = async () => {
    if (!evalId) return;

    // Observer
    for (const [k, v] of Object.entries(pendingObserverNotes)) {
      const id = Number(k);
      await setObserverNote(evalId, id, (v ?? '').trim());
    }
    // Self
    for (const [k, v] of Object.entries(pendingSelfNotes)) {
      const id = Number(k);
      await setSelfNote(evalId, id, (v ?? '').trim());
    }

    // Clear pending caches
    setPendingObserverNotes({});
    setPendingSelfNotes({});
  };

  // Summary feedback handlers
  const handleSummaryFeedbackChange = async (feedback: string) => {
    if (!evalId) return;
    try {
      await updateSummaryFeedback(evalId, { summary_feedback: feedback });
      setSummaryFeedback(feedback);
    } catch (error) {
      console.error('Failed to save summary feedback:', error);
      toast({
        title: "Error",
        description: "Failed to save feedback",
        variant: "destructive"
      });
    }
  };

  const handleSummaryTranscriptChange = async (transcript: string) => {
    if (!evalId) return;
    try {
      await updateSummaryFeedback(evalId, { summary_raw_transcript: transcript });
      setSummaryRawTranscript(transcript);
    } catch (error) {
      console.error('Failed to save transcript:', error);
    }
  };

  // Draft observation audio handlers
  const handleDraftAudioSaved = async (path: string) => {
    if (!evalId) return;
    try {
      await supabase
        .from('evaluations')
        .update({ draft_observation_audio_path: path })
        .eq('id', evalId);
      setDraftObservationAudioPath(path);
    } catch (error) {
      console.error('Failed to save draft audio path:', error);
    }
  };

  const handleDraftAudioCleared = async () => {
    if (!evalId) return;
    try {
      await supabase
        .from('evaluations')
        .update({ draft_observation_audio_path: null })
        .eq('id', evalId);
      setDraftObservationAudioPath(null);
    } catch (error) {
      console.error('Failed to clear draft audio path:', error);
    }
  };

  // Draft interview audio handlers
  const handleDraftInterviewAudioSaved = async (path: string) => {
    if (!evalId) return;
    try {
      await supabase
        .from('evaluations')
        .update({ draft_interview_audio_path: path })
        .eq('id', evalId);
      setDraftInterviewAudioPath(path);
    } catch (error) {
      console.error('Failed to save draft interview audio path:', error);
    }
  };

  const handleDraftInterviewAudioCleared = async () => {
    if (!evalId) return;
    try {
      await supabase
        .from('evaluations')
        .update({ draft_interview_audio_path: null })
        .eq('id', evalId);
      setDraftInterviewAudioPath(null);
    } catch (error) {
      console.error('Failed to clear draft interview audio path:', error);
    }
  };

  const handleInterviewRecordingFinalized = async (path: string) => {
    if (!evalId) return;
    try {
      // Update the audio_recording_path (main interview recording)
      const { error: updateError } = await supabase
        .from('evaluations')
        .update({ audio_recording_path: path })
        .eq('id', evalId);
      
      if (updateError) throw updateError;
      
      setEvaluation(prev => prev ? {
        ...prev,
        audio_recording_path: path
      } : prev);
      
      await loadCurrentRecording(path);
    } catch (error) {
      console.error('Failed to finalize interview recording:', error);
      toast({
        title: 'Error',
        description: 'Failed to save recording path',
        variant: 'destructive'
      });
    }
  };

  // Step 2: Transcribe interview audio only (no insight extraction)
  const handleTranscribeInterview = async () => {
    if (!evaluation?.audio_recording_path || !evalId) return;
    
    setIsTranscribingInterview(true);
    setChunkProgress(null);

    try {
      // Step 1: Download the audio file
      const { data: audioData, error: downloadError } = await supabase.storage
        .from('evaluation-recordings')
        .download(evaluation.audio_recording_path);
      
      if (downloadError) throw downloadError;
      
      // Step 2: Transcribe with automatic chunking for large files
      const result = await transcribeWithChunking(audioData, (progress) => {
        setChunkProgress(progress);
      });
      
      const rawTranscript = result.transcript;
      if (!rawTranscript) {
        throw new Error('No transcript returned from transcription');
      }

      if (result.chunked) {
        console.log(`[EvaluationHub] Large interview transcribed in ${result.totalChunks} chunks`);
      }
      
      // Step 3: Parse the transcript to identify speakers
      const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-interview', {
        body: { transcript: rawTranscript },
      });
      
      if (parseError) throw parseError;
      
      const parsedTranscript = parseData?.parsedTranscript;
      if (!parsedTranscript) {
        throw new Error('No parsed transcript returned');
      }
      
      // Step 4: Save to database
      await updateInterviewTranscript(evalId, parsedTranscript);
      setInterviewTranscript(parsedTranscript);
      
      // Show transcription complete state and auto-expand transcript
      setTranscriptionJustCompletedInterview(true);
      setIsTranscriptExpanded(true);
      
      toast({
        title: 'Transcription Complete',
        description: 'Review and edit the transcript, then click "Analyze" to extract insights.',
      });
    } catch (error) {
      console.error('Transcription/parsing failed:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to transcribe interview",
        variant: "destructive"
      });
    } finally {
      setIsTranscribingInterview(false);
      setChunkProgress(null);
    }
  };

  // Step 3: Analyze interview transcript to extract insights (separate from transcription)
  const handleAnalyzeInterview = async () => {
    if (!evalId || !interviewTranscript) return;
    
    setIsParsing(true);

    try {
      const { data, error } = await supabase.functions.invoke('extract-insights', {
        body: { transcript: interviewTranscript, staffName, source: 'interview' },
      });
      
      if (error) throw error;
      
      if (data?.insights) {
        // Save under self_assessment key
        const currentInsights = (evaluation?.extracted_insights as any) || {};
        const updatedInsights = {
          ...currentInsights,
          self_assessment: {
            summary_html: data.insights.summary_html,
            domain_insights: data.insights.domain_insights
          }
        };
        await updateExtractedInsights(evalId, updatedInsights);
        setEvaluation(prev => prev ? { ...prev, extracted_insights: updatedInsights } : prev);
        
        // Show analysis complete state
        setTranscriptionJustCompletedInterview(false);
        setAnalysisJustCompletedInterview(true);
        
        toast({ 
          title: 'Analysis Complete', 
          description: 'Self-assessment insights have been extracted.' 
        });
      }
    } catch (err) {
      console.error('Extract insights failed:', err);
      toast({ title: 'Error', description: 'Failed to extract insights', variant: 'destructive' });
    } finally {
      setIsParsing(false);
    }
  };

  // Handler for View Insights button (interview)
  const handleViewInterviewInsights = useCallback(() => {
    setAnalysisJustCompletedInterview(false);
    setActiveTab('summary');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Handler for Review Transcript button (interview)
  const handleReviewInterviewTranscript = useCallback(() => {
    setTranscriptionJustCompletedInterview(false);
    setIsTranscriptExpanded(true);
  }, []);

  // Handler for pasting transcript (bypasses audio recording)
  const handlePasteTranscript = async () => {
    if (!evalId || !pastedTranscript.trim()) return;
    
    try {
      // Save the pasted transcript directly
      await updateInterviewTranscript(evalId, pastedTranscript.trim());
      setInterviewTranscript(pastedTranscript.trim());
      
      // Show transcription complete state and auto-expand transcript
      setTranscriptionJustCompletedInterview(true);
      setIsTranscriptExpanded(true);
      
      // Close dialog and reset
      setShowPasteTranscriptDialog(false);
      setPastedTranscript('');
      
      toast({
        title: 'Transcript Saved',
        description: 'Review the transcript, then click "Analyze" to extract insights.',
      });
    } catch (error) {
      console.error('Failed to save pasted transcript:', error);
      toast({
        title: "Error",
        description: "Failed to save transcript",
        variant: "destructive"
      });
    }
  };

  const handleInterviewTranscriptChange = async (value: string) => {
    if (!evalId) return;
    setInterviewTranscript(value);
    try {
      await updateInterviewTranscript(evalId, value);
    } catch (error) {
      console.error('Failed to save interview transcript:', error);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const loadCurrentRecording = async (path: string) => {
    if (!evalId) return;
    try {
      const folder = evalId;
      const { data, error } = await supabase.storage
        .from('evaluation-recordings')
        .list(folder);
      
      if (error) throw error;
      
      const file = data?.find(f => path.includes(f.name));
      if (file) {
        setCurrentRecording({
          path,
          name: file.name,
          size: file.metadata?.size || 0,
          uploaded_at: file.created_at
        });
      }
    } catch (error) {
      console.error('Failed to load recording metadata:', error);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile || !evalId) return;
    
    try {
      setIsUploading(true);
      
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${evalId}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('evaluation-recordings')
        .upload(fileName, selectedFile, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (uploadError) throw uploadError;
      
      const { error: updateError } = await supabase
        .from('evaluations')
        .update({ audio_recording_path: fileName })
        .eq('id', evalId);
      
      if (updateError) throw updateError;
      
      setEvaluation(prev => prev ? {
        ...prev,
        audio_recording_path: fileName
      } : prev);
      
      await loadCurrentRecording(fileName);
      
      toast({
        title: "Success",
        description: "Audio recording uploaded successfully"
      });
      
      setSelectedFile(null);
    } catch (error) {
      console.error('Upload failed:', error);
      toast({
        title: "Error",
        description: "Failed to upload recording",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteRecording = async () => {
    if (!evaluation?.audio_recording_path || !evalId) return;
    
    try {
      const { error: storageError } = await supabase.storage
        .from('evaluation-recordings')
        .remove([evaluation.audio_recording_path]);
      
      if (storageError) throw storageError;
      
      const { error: updateError } = await supabase
        .from('evaluations')
        .update({ audio_recording_path: null })
        .eq('id', evalId);
      
      if (updateError) throw updateError;
      
      setEvaluation(prev => prev ? {
        ...prev,
        audio_recording_path: null
      } : prev);
      setCurrentRecording(null);
      
      toast({
        title: "Success",
        description: "Recording deleted successfully"
      });
    } catch (error) {
      console.error('Delete failed:', error);
      toast({
        title: "Error",
        description: "Failed to delete recording",
        variant: "destructive"
      });
    }
  };

  const handleDownloadRecording = async () => {
    if (!evaluation?.audio_recording_path) return;
    
    try {
      const { data, error } = await supabase.storage
        .from('evaluation-recordings')
        .createSignedUrl(evaluation.audio_recording_path, 3600);
      
      if (error) throw error;
      
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: "Error",
        description: "Failed to download recording",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-32 bg-muted rounded"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!evaluation) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Evaluation Not Found</h1>
          <Button onClick={() => navigate(`/coach/${staffId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Staff Detail
          </Button>
        </div>
      </div>
    );
  }

  const completionStatus = isEvaluationComplete(evaluation);
  const mode = searchParams.get('mode');
  const isReadOnly = evaluation.status === 'submitted' && mode === 'view';
  
  // Group and sort items by domain and competency ID
  const domainOrder = ['Clinical', 'Clerical', 'Cultural', 'Case Acceptance'];
  const groupedItems = evaluation.items.reduce((acc, item) => {
    const domain = item.domain_name || 'Other';
    if (!acc[domain]) {
      acc[domain] = [];
    }
    acc[domain].push(item);
    return acc;
  }, {} as Record<string, typeof evaluation.items>);
  
  // Sort items within each domain by competency_id, then arrange domains in order
  const sortedItems = domainOrder
    .filter(domain => groupedItems[domain])
    .flatMap(domain => 
      groupedItems[domain].sort((a, b) => a.competency_id - b.competency_id)
    )
    .concat(
      // Add any domains not in the predefined order
      Object.keys(groupedItems)
        .filter(domain => !domainOrder.includes(domain))
        .flatMap(domain => 
          groupedItems[domain].sort((a, b) => a.competency_id - b.competency_id)
        )
    );
  
  const currentItem = sortedItems[currentSelfIndex];
  
  // Calculate observation completion count (include NA items)
  const observerScoresCount = evaluation.items.filter(item => item.observer_score !== null || item.observer_is_na === true).length;
  const selfScoresCount = evaluation.items.filter(item => item.self_score !== null || item.self_is_na === true).length;
  const totalItems = evaluation.items.length;

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <Button 
            variant="outline" 
            onClick={() => navigate(`/coach/${staffId}`)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="space-y-2">
            {mode === 'edit' ? (
              <div className="flex items-center gap-2">
                <Select value={editType} onValueChange={handleTypeChange}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Baseline">Baseline</SelectItem>
                    <SelectItem value="Quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
                {editType === 'Quarterly' && (
                  <Select value={editQuarter || ''} onValueChange={handleQuarterChange}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Quarter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Q1">Q1</SelectItem>
                      <SelectItem value="Q2">Q2</SelectItem>
                      <SelectItem value="Q3">Q3</SelectItem>
                      <SelectItem value="Q4">Q4</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                <span className="text-xl font-bold">
                  {evaluation.program_year} Evaluation
                </span>
              </div>
            ) : (
              <h1 className="text-2xl font-bold">
                {evaluation.type} {evaluation.quarter ? `${evaluation.quarter} ` : ''}{evaluation.program_year} Evaluation
              </h1>
            )}
            <div className="flex items-center gap-2">
              <p className="text-muted-foreground">
                {staffName || 'Staff Member'} • {evaluation.status === 'draft' ? 'Draft' : 'Submitted'}
              </p>
              {mode === 'edit' && (
                <>
                  <span className="text-muted-foreground">•</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs">
                        <CalendarIcon className="w-3 h-3 mr-1" />
                        {editDate ? format(editDate, 'MMM d, yyyy') : 'Set date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={editDate}
                        onSelect={handleDateChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                size="sm"
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Evaluation</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. Are you sure you want to delete this evaluation report?
                  This will permanently remove the evaluation and all associated data.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDeleteEvaluation}
                  disabled={isDeleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {isReadOnly && <Badge variant="default">Submitted</Badge>}
        </div>
      </div>


      {/* Progress & Submit Bar */}
      {!isReadOnly && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <div className="flex items-center space-x-2">
                  {completionStatus.observerComplete ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-muted-foreground"></div>
                  )}
                  <span className={cn(
                     "font-medium",
                     completionStatus.observerComplete ? "text-green-600" : "text-muted-foreground"
                   )}>
                     Observation ({observerScoresCount}/{totalItems})
                     {completionStatus.observerNaCount > 0 && (
                       <span className="text-muted-foreground font-normal"> · {completionStatus.observerNaCount} N/A</span>
                     )}
                     {completionStatus.missingObserverNotes > 0 && (
                       <span className="text-orange-600 dark:text-orange-400 font-normal"> · {completionStatus.missingObserverNotes} note{completionStatus.missingObserverNotes !== 1 ? 's' : ''} needed</span>
                     )}
                   </span>
                </div>
              </div>
              <Button
                onClick={handleSubmitClick}
                disabled={!completionStatus.canSubmit || isSubmitting}
                className="bg-primary hover:bg-primary/90"
                title="Submit and release results to the staff member"
              >
                {isSubmitting ? "Submitting..." : "Submit & Release to Staff"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* NA Confirmation Dialog */}
      <AlertDialog open={showNaConfirmDialog} onOpenChange={setShowNaConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Submission</AlertDialogTitle>
            <AlertDialogDescription>
              There {completionStatus.naCount === 1 ? 'is' : 'are'} {completionStatus.naCount} competenc{completionStatus.naCount === 1 ? 'y' : 'ies'} marked as "Not Observed/N/A". Are you sure you want to submit?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmitEvaluation}>
              I'm Sure
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="observation">Observation</TabsTrigger>
          <TabsTrigger value="summary" className="flex items-center gap-2">
            Summary
            {recordingState.isRecording && (
              <span className={cn(
                "w-2 h-2 rounded-full",
                recordingState.isPaused ? "bg-amber-500" : "bg-red-500 animate-pulse"
              )} />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="observation">
          {/* Floating Recorder Pill - shows when scrolling and recording */}
          {showFloatingPill && recordingState.isRecording && (
            <FloatingRecorderPill
              recordingTime={recordingState.recordingTime}
              isRecording={recordingState.isRecording}
              isPaused={recordingState.isPaused}
              onPauseToggle={recordingControls.togglePause}
              onDoneClick={scrollToProcessSection}
              activeCompetencyLabel={activeCompetencyLabel}
              showArrow
              alwaysShowStartOver
              onStartOver={() => {
                recordingControls.resetRecording();
                setActiveCompetencyId(null);
                setCompetencyTimeline([]);
                recordingStartTimeRef.current = 0;
              }}
              anchorTop={activeCompetencyId != null ? (() => {
                const el = rowRefs.current.get(activeCompetencyId);
                if (!el) return null;
                const rect = el.getBoundingClientRect();
                return rect.top + rect.height / 2;
              })() : null}
            />
          )}

          {/* Recording Start Card at TOP - minimal trigger */}
          {!isReadOnly && (
             <RecordingStartCard
              ref={startCardRef}
              isRecording={recordingState.isRecording}
              isPaused={recordingState.isPaused}
              recordingTime={recordingState.recordingTime}
              isSavingDraft={isSavingDraft}
              onStartRecording={recordingControls.startRecording}
              onPauseToggle={recordingControls.togglePause}
              onStartOver={() => {
                recordingControls.resetRecording();
                setActiveCompetencyId(null);
                setCompetencyTimeline([]);
                recordingStartTimeRef.current = 0;
              }}
              disabled={isTranscribingObservation || isMappingToNotes}
              hasDraftRecording={!!restoredAudioUrl}
              isLoadingDraft={isLoadingDraft}
              hasExistingInsights={hasExistingObserverNotes}
              activeCompetencyLabel={activeCompetencyLabel}
            />
          )}
          
          <Card>
            <CardHeader>
              <CardTitle>Observation Scores & Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {evaluation.items.map((item) => {
                const isActive = recordingState.isRecording && activeCompetencyId === item.competency_id;
                const domainColor = item.domain_name ? getDomainColor(item.domain_name) : undefined;
                return (
                <div 
                  key={item.competency_id} 
                  data-competency-id={item.competency_id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(item.competency_id, el);
                    else rowRefs.current.delete(item.competency_id);
                  }}
                  onClick={() => handleCompetencyTap(item.competency_id)}
                  className={cn(
                    "border rounded-lg p-4 space-y-4 transition-all",
                    recordingState.isRecording && !isActive && "border-dashed cursor-pointer hover:bg-muted/40",
                    isActive && "ring-2 shadow-md cursor-pointer"
                  )}
                  style={isActive && domainColor ? {
                    outline: `3px solid ${domainColor}`,
                    boxShadow: `0 0 12px ${domainColor}40`,
                  } : undefined}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-medium">{item.competency_name_snapshot}</h4>
                    {item.domain_name && (
                      <Badge 
                        variant="secondary" 
                        className="text-xs"
                        style={{ 
                          backgroundColor: getDomainColor(item.domain_name),
                          color: '#000'
                        }}
                      >
                        {item.domain_name}
                      </Badge>
                    )}
                  </div>
                  
                  {(item as any).tagline && (
                    <p className="text-sm text-muted-foreground italic -mt-2 mb-2">
                      "{(item as any).tagline}"
                    </p>
                  )}
                  
                  {item.competency_description && (
                    <p className="text-sm text-muted-foreground">
                      {item.competency_description}
                    </p>
                  )}

                  <ProMovesAccordion competencyId={item.competency_id} />
                  
                  {/* Score Pills */}
                  <div className="flex space-x-2 flex-wrap gap-y-2">
                    {/* N/A Button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); !isReadOnly && handleObserverNAChange(item.competency_id, !item.observer_is_na); }}
                      disabled={isReadOnly || saving}
                      className={cn(
                        "px-3 py-2 rounded-md text-sm font-medium border transition-colors",
                        item.observer_is_na
                          ? "bg-muted text-muted-foreground border-muted-foreground"
                          : "bg-background border-border hover:bg-muted",
                        isReadOnly && "cursor-not-allowed opacity-60"
                      )}
                    >
                      N/A
                    </button>
                    {SCORE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        onClick={(e) => { e.stopPropagation(); !isReadOnly && handleObserverScoreChange(item.competency_id, option.value); }}
                        disabled={isReadOnly || saving}
                        className={cn(
                          "px-3 py-2 rounded-md text-sm font-medium border transition-colors",
                          item.observer_score === option.value && !item.observer_is_na
                            ? option.color
                            : "bg-background border-border hover:bg-muted",
                          isReadOnly && "cursor-not-allowed opacity-60"
                        )}
                      >
                        {option.value}
                      </button>
                    ))}
                  </div>

                  {/* Aggregated self-score (read-only, from weekly performance submissions). */}
                  {evaluation.type === 'Quarterly' && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span className="font-medium uppercase tracking-wide">Their self-score:</span>
                      {(item as any).self_score_sample_size && (item as any).self_score_sample_size >= 3 ? (
                        <>
                          <span className="px-2 py-0.5 rounded bg-muted text-foreground font-medium">
                            {(item as any).self_score_avg ?? item.self_score}
                          </span>
                          <span>
                            avg of {(item as any).self_score_sample_size} weekly submission{(item as any).self_score_sample_size === 1 ? '' : 's'}
                          </span>
                        </>
                      ) : (
                        <span className="italic">Not enough data</span>
                      )}
                    </div>
                  )}

                   {/* Conditional Notes */}
                   {(() => {
                     const isLowScore = item.observer_score !== null && item.observer_score <= 2;
                     const noteValue = pendingObserverNotes[item.competency_id] ?? item.observer_note ?? '';
                     const noteEmpty = !noteValue || noteValue.trim() === '';
                     const shouldShowTextarea = showObserverNotes[item.competency_id] || isLowScore || (isReadOnly && item.observer_note && item.observer_note.trim());
                     
                     return shouldShowTextarea ? (
                        <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                          <Textarea
                           placeholder={isLowScore ? "Note required for scores of 1-2..." : "Add your notes..."}
                           value={noteValue}
                           onChange={(e) => draftObserverNote(item.competency_id, e.target.value)}
                           onBlur={() => saveOneObserverNote(item.competency_id)}
                           disabled={isReadOnly}
                           className={cn(
                             "min-h-[80px]",
                             isLowScore && noteEmpty && !isReadOnly && "border-orange-400 focus-visible:ring-orange-400"
                           )}
                         />
                         {isLowScore && !isReadOnly && (
                           <p className={cn(
                             "text-xs",
                             noteEmpty ? "text-orange-600 dark:text-orange-400 font-medium" : "text-muted-foreground"
                           )}>
                             {noteEmpty ? "⚠ Note required for scores of 1-2" : "Note required for scores of 1-2"}
                           </p>
                         )}
                       </div>
                     ) : (
                       <Button
                         variant="outline"
                         size="sm"
                         onClick={(e) => { e.stopPropagation(); setShowObserverNotes(prev => ({ ...prev, [item.competency_id]: true })); }}
                         disabled={isReadOnly}
                         className="flex items-center gap-2"
                       >
                         <Plus className="w-4 h-4" />
                         Add Note
                       </Button>
                     );
                   })()}
                </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Recording Process Card at BOTTOM - after all competencies */}
          {!isReadOnly && (
            <div ref={processSectionRef}>
              <RecordingProcessCard
                recordingState={recordingState}
                recordingControls={recordingControls}
                restoredAudioUrl={restoredAudioUrl}
                restoredAudioBlob={restoredAudioBlob}
                isLoadingDraft={isLoadingDraft}
                isTranscribing={isTranscribingObservation || isMappingToNotes}
                processingStep={processingStep}
                onTranscribeAudio={handleTranscribeObservation}
                onDiscardRestored={handleDiscardRestoredAudio}
                onFinishAndTranscribe={handleFinishAndTranscribe}
                onStartOver={() => {
                  recordingControls.resetRecording();
                  setActiveCompetencyId(null);
                  setCompetencyTimeline([]);
                  recordingStartTimeRef.current = 0;
                }}
              />
            </div>
          )}

          {/* Observation Transcript Card - collapsible like interview transcript */}
          {summaryRawTranscript && (
            <Card className="mt-6" ref={transcriptSectionRef}>
              <CardHeader 
                className="cursor-pointer select-none py-3"
                onClick={() => setIsObservationTranscriptExpanded(!isObservationTranscriptExpanded)}
              >
                <CardTitle className="text-base flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Observation Transcript
                  </div>
                  <ChevronRight className={cn(
                    "w-5 h-5 transition-transform text-muted-foreground",
                    isObservationTranscriptExpanded && "rotate-90"
                  )} />
                </CardTitle>
              </CardHeader>
              {isObservationTranscriptExpanded && (
                <CardContent className="pt-0">
                  <div className="space-y-4">
                    <ReactQuill
                      theme="snow"
                      value={summaryRawTranscript}
                      onChange={handleSummaryTranscriptChange}
                      readOnly={isReadOnly}
                      className="bg-background [&_.ql-editor]:min-h-[100px]"
                      modules={{
                        toolbar: isReadOnly ? false : [
                          ['bold', 'italic'],
                          [{ 'list': 'bullet' }],
                          ['clean']
                        ]
                      }}
                    />
                    {!isReadOnly && (
                      <p className="text-xs text-muted-foreground">
                        You can edit the transcript above to correct any transcription errors.
                      </p>
                    )}
                    
                    {/* Map to Notes button - only show if not read-only */}
                    {!isReadOnly && (
                      <div className="pt-3 border-t flex items-center justify-between">
                        {mappingJustCompleted ? (
                          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                            <Check className="w-4 h-4" />
                            <span className="text-sm font-medium">Notes populated</span>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Ready to populate competency notes from your observation?
                          </p>
                        )}
                        <Button 
                          onClick={() => handleMapToNotes()}
                          disabled={isMappingToNotes || !summaryRawTranscript}
                          className="gap-2"
                        >
                          {isMappingToNotes ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Mapping...
                            </>
                          ) : mappingJustCompleted ? (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Re-map Notes
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Map to Notes
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </TabsContent>



        <TabsContent value="summary">
          <SummaryTab
            summaryFeedback={summaryFeedback}
            extractedInsights={evaluation?.extracted_insights || null}
            interviewTranscript={interviewTranscript}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}