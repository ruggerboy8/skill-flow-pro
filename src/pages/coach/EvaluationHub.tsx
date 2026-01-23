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
import { useAudioRecording } from '@/hooks/useAudioRecording';
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
  const [transcriptionJustCompleted, setTranscriptionJustCompleted] = useState(false);
  const [analysisJustCompleted, setAnalysisJustCompleted] = useState(false);
  const startCardRef = useRef<HTMLDivElement>(null);
  const processSectionRef = useRef<HTMLDivElement>(null);
  const transcriptSectionRef = useRef<HTMLDivElement>(null);
  
  
  // Sidebar control
  const { setOpen: setSidebarOpen } = useSidebar();

  // Audio recording state - lifted here so it persists across tab switches
  const { state: recordingState, controls: recordingControls } = useAudioRecording();

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
      { threshold: 0.1 }
    );
    
    if (startCardRef.current) {
      observer.observe(startCardRef.current);
    }
    
    return () => observer.disconnect();
  }, [recordingState.isRecording]);


  // Auto-collapse sidebar when recording starts
  useEffect(() => {
    if (recordingState.isRecording) {
      setSidebarOpen(false);
    }
  }, [recordingState.isRecording, setSidebarOpen]);

  // Scroll to process section when "Done?" is clicked
  const scrollToProcessSection = useCallback(() => {
    processSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Calculate insights summary for success state
  const insightsSummary = React.useMemo(() => {
    const observer = evaluation?.extracted_insights?.observer;
    if (!observer?.domain_insights) return null;
    
    let strengthCount = 0;
    let growthCount = 0;
    
    observer.domain_insights.forEach((d: any) => {
      strengthCount += d.strengths?.length || 0;
      growthCount += d.growth_areas?.length || 0;
    });
    
    return { strengthCount, growthCount };
  }, [evaluation?.extracted_insights]);

  // Handler for View Insights button
  const handleViewInsights = useCallback(() => {
    setAnalysisJustCompleted(false);
    setActiveTab('summary');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Handler for Edit Transcript button
  const handleEditTranscript = useCallback(() => {
    setTranscriptionJustCompleted(false);
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
      // Step 1: Transcribe audio using OpenAI Whisper
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const transcribeResponse = await supabase.functions.invoke('transcribe-audio', {
        body: formData,
      });

      if (transcribeResponse.error) {
        throw new Error(transcribeResponse.error.message || 'Transcription failed');
      }

      const rawTranscript = transcribeResponse.data?.transcript;
      if (!rawTranscript) {
        throw new Error('No transcript returned');
      }

      // Log which service was used for debugging
      if (transcribeResponse.data?.service === 'elevenlabs') {
        console.log('[EvaluationHub] Large file transcribed using ElevenLabs');
      }

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

      // Show transcription complete state and auto-expand transcript
      setTranscriptionJustCompleted(true);
      setIsObservationTranscriptExpanded(true);
      
      toast({
        title: 'Transcription Complete',
        description: 'Review and edit the transcript, then click "Analyze" to extract insights.',
      });
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

  // Step 3: Analyze transcript to extract insights (separate from transcription)
  const handleAnalyzeObservation = async () => {
    if (!evalId || !summaryRawTranscript) return;
    
    setIsAnalyzingObservation(true);
    setProcessingStep('Extracting insights...');

    try {
      const extractResponse = await supabase.functions.invoke('extract-insights', {
        body: { transcript: summaryRawTranscript, staffName, source: 'observation' },
      });

      if (extractResponse.error) {
        throw new Error(extractResponse.error.message || 'Insight extraction failed');
      }

      const insights = extractResponse.data?.insights as InsightsPerspective;
      if (!insights) {
        throw new Error('No insights returned');
      }

      // Save to database - merge with existing insights
      const updatedInsights: ExtractedInsights = {
        ...evaluation?.extracted_insights,
        observer: insights
      };
      
      await updateExtractedInsights(evalId, updatedInsights);

      // Update local state
      handleSummaryFeedbackChange(insights.summary_html || '');
      setEvaluation(prev => prev ? { ...prev, extracted_insights: updatedInsights } : prev);

      // Show analysis complete state
      setTranscriptionJustCompleted(false);
      setAnalysisJustCompleted(true);
      
      toast({
        title: 'Analysis Complete',
        description: 'Insights have been extracted from your observation.',
      });
    } catch (error) {
      console.error('[EvaluationHub] Analysis error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to analyze transcript',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzingObservation(false);
      setProcessingStep('');
    }
  };

  // Combined handler: stop recording and immediately transcribe (not analyze)
  const handleFinishAndTranscribe = async () => {
    // Stop the recording and get blob directly (avoids stale closure)
    const audioBlob = await recordingControls.stopAndGetBlob();
    
    if (audioBlob) {
      await handleTranscribeObservation(audioBlob);
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
    
    if (completionStatus.naCount > 0) {
      setShowNaConfirmDialog(true);
    } else {
      handleSubmitEvaluation();
    }
  };

  const handleSubmitEvaluation = async () => {
    if (!evalId || !evaluation) return;
    
    try {
      setIsSubmitting(true);
      setShowNaConfirmDialog(false);

      await submitEvaluation(evalId);
      
      toast({
        title: "Success",
        description: "Evaluation submitted successfully",
        variant: "default"
      });

      // Refresh evaluation data
      await loadEvaluation();
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

    try {
      // Step 1: Download the audio file
      const { data: audioData, error: downloadError } = await supabase.storage
        .from('evaluation-recordings')
        .download(evaluation.audio_recording_path);
      
      if (downloadError) throw downloadError;
      
      // Step 2: Send to transcribe-audio edge function
      const formData = new FormData();
      const originalFilename = evaluation.audio_recording_path.split('/').pop() || 'audio.m4a';
      formData.append('audio', audioData, originalFilename);
      
      const { data: transcribeData, error: transcribeError } = await supabase.functions.invoke('transcribe-audio', {
        body: formData,
      });
      
      if (transcribeError) throw transcribeError;
      
      const rawTranscript = transcribeData?.transcript;
      if (!rawTranscript) {
        throw new Error('No transcript returned from transcription');
      }

      // Log which service was used for debugging
      if (transcribeData?.service === 'elevenlabs') {
        console.log('[EvaluationHub] Large interview file transcribed using ElevenLabs');
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
                   </span>
                </div>
                <div className="flex items-center space-x-2">
                  {completionStatus.selfComplete ? (
                    <Check className="w-5 h-5 text-green-600" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-muted-foreground"></div>
                  )}
                  <span className={cn(
                    "font-medium",
                    completionStatus.selfComplete ? "text-green-600" : "text-muted-foreground"
                  )}>
                    Self-Assessment ({selfScoresCount}/{totalItems})
                    {completionStatus.selfNaCount > 0 && (
                      <span className="text-muted-foreground font-normal"> · {completionStatus.selfNaCount} N/A</span>
                    )}
                  </span>
                </div>
              </div>
              <Button 
                onClick={handleSubmitClick}
                disabled={!completionStatus.canSubmit || isSubmitting}
                className="bg-primary hover:bg-primary/90"
              >
                {isSubmitting ? "Submitting..." : "Submit Evaluation"}
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
          <TabsTrigger value="self-assessment">Self-Assessment</TabsTrigger>
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
              disabled={isTranscribingObservation || isAnalyzingObservation}
              hasDraftRecording={!!restoredAudioUrl}
              isLoadingDraft={isLoadingDraft}
              hasExistingInsights={!!insightsSummary}
            />
          )}
          
          <Card>
            <CardHeader>
              <CardTitle>Observation Scores & Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {evaluation.items.map((item) => (
                <div 
                  key={item.competency_id} 
                  className="border rounded-lg p-4 space-y-4"
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
                      onClick={() => !isReadOnly && handleObserverNAChange(item.competency_id, !item.observer_is_na)}
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
                        onClick={() => !isReadOnly && handleObserverScoreChange(item.competency_id, option.value)}
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

                   {/* Conditional Notes */}
                   {showObserverNotes[item.competency_id] || (isReadOnly && item.observer_note && item.observer_note.trim()) ? (
                     <Textarea
                       placeholder="Add your notes..."
                       value={pendingObserverNotes[item.competency_id] ?? item.observer_note ?? ''}
                       onChange={(e) => draftObserverNote(item.competency_id, e.target.value)}
                       onBlur={() => saveOneObserverNote(item.competency_id)}
                       disabled={isReadOnly}
                       className="min-h-[80px]"
                     />
                   ) : (
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => setShowObserverNotes(prev => ({ ...prev, [item.competency_id]: true }))}
                       disabled={isReadOnly}
                       className="flex items-center gap-2"
                     >
                       <Plus className="w-4 h-4" />
                       Add Note
                     </Button>
                   )}
                </div>
              ))}
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
                isTranscribing={isTranscribingObservation}
                processingStep={processingStep}
                onTranscribeAudio={handleTranscribeObservation}
                onDiscardRestored={handleDiscardRestoredAudio}
                onFinishAndTranscribe={handleFinishAndTranscribe}
                transcriptionComplete={transcriptionJustCompleted}
                onEditTranscript={handleEditTranscript}
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
                    
                    {/* Analyze button - only show if not read-only */}
                    {!isReadOnly && (
                      <div className="pt-3 border-t flex items-center justify-between">
                        {analysisJustCompleted ? (
                          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                            <Check className="w-4 h-4" />
                            <span className="text-sm font-medium">Insights extracted</span>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Ready to extract insights from your observation?
                          </p>
                        )}
                        <Button 
                          onClick={handleAnalyzeObservation}
                          disabled={isAnalyzingObservation || !summaryRawTranscript}
                          className="gap-2"
                        >
                          {isAnalyzingObservation ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Analyzing...
                            </>
                          ) : analysisJustCompleted ? (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Re-analyze
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Analyze & Extract Insights
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                    
                    {/* View Insights link after analysis */}
                    {analysisJustCompleted && insightsSummary && (
                      <div className="p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                            <span className="text-sm text-green-800 dark:text-green-200">
                              Found {insightsSummary.strengthCount} strength{insightsSummary.strengthCount !== 1 ? 's' : ''} and {insightsSummary.growthCount} growth area{insightsSummary.growthCount !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <Button variant="outline" size="sm" onClick={handleViewInsights} className="gap-1.5">
                            View Insights
                            <ArrowRight className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="self-assessment">
          {/* Self-Assessment Competencies Card - Now First */}
          {currentItem && (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Self-Assessment ({currentSelfIndex + 1} of {sortedItems.length})</CardTitle>
                  <div className="flex items-center space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setCurrentSelfIndex(Math.max(0, currentSelfIndex - 1))}
                      disabled={currentSelfIndex === 0}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setCurrentSelfIndex(Math.min(sortedItems.length - 1, currentSelfIndex + 1))}
                      disabled={currentSelfIndex === sortedItems.length - 1}
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <Progress value={((currentSelfIndex + 1) / sortedItems.length) * 100} className="w-full" />
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-medium text-lg">{currentItem.competency_name_snapshot}</h4>
                    {currentItem.domain_name && (
                      <Badge 
                        variant="secondary" 
                        className="text-xs"
                        style={{ 
                          backgroundColor: getDomainColor(currentItem.domain_name),
                          color: '#000'
                        }}
                      >
                        {currentItem.domain_name}
                      </Badge>
                    )}
                  </div>
                  
                  {(currentItem as any).tagline && (
                    <p className="text-sm text-muted-foreground italic mb-2">
                      "{(currentItem as any).tagline}"
                    </p>
                  )}
                  
                  {currentItem.competency_description && (
                    <p className="text-sm text-muted-foreground mb-3">
                      {currentItem.competency_description}
                    </p>
                  )}

                  <ProMovesAccordion competencyId={currentItem.competency_id} className="mb-4" />
                  
                  <p className="text-muted-foreground mb-4">
                    <strong>Interview Prompt:</strong> {currentItem.interview_prompt || 'No interview prompt available for this competency.'}
                  </p>
                </div>

                {/* Score Pills */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Self-Assessment Score</label>
                  <div className="flex space-x-2 flex-wrap gap-y-2">
                    {/* N/A Button */}
                    <button
                      onClick={() => !isReadOnly && handleSelfNAChange(currentItem.competency_id, !currentItem.self_is_na)}
                      disabled={isReadOnly || saving}
                      className={cn(
                        "px-3 py-2 rounded-md text-sm font-medium border transition-colors",
                        currentItem.self_is_na
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
                        onClick={() => !isReadOnly && handleSelfScoreChange(currentItem.competency_id, option.value)}
                        disabled={isReadOnly || saving}
                        className={cn(
                          "px-3 py-2 rounded-md text-sm font-medium border transition-colors",
                          currentItem.self_score === option.value && !currentItem.self_is_na
                            ? option.color
                            : "bg-background border-border hover:bg-muted",
                          isReadOnly && "cursor-not-allowed opacity-60"
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                 {/* Conditional Notes */}
                 {showSelfNote || (isReadOnly && currentItem.self_note && currentItem.self_note.trim()) ? (
                   <div className="space-y-2">
                     <label className="text-sm font-medium">Self-Assessment Notes</label>
                     <Textarea
                       placeholder="Please share your thoughts and examples..."
                       value={pendingSelfNotes[currentItem.competency_id] ?? currentItem.self_note ?? ''}
                       onChange={(e) => draftSelfNote(currentItem.competency_id, e.target.value)}
                       onBlur={() => saveOneSelfNote(currentItem.competency_id)}
                       disabled={isReadOnly}
                       className="min-h-[120px]"
                     />
                   </div>
                 ) : (
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={() => setShowSelfNote(true)}
                     disabled={isReadOnly}
                     className="flex items-center gap-2"
                   >
                     <Plus className="w-4 h-4" />
                     Add Note
                   </Button>
                 )}
              </CardContent>
            </Card>
          )}

          {/* Self-Evaluation Interview Recording - Now Below Competencies */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mic className="w-5 h-5" />
                Self-Evaluation Interview Recording
              </CardTitle>
            </CardHeader>
            <CardContent>
              {currentRecording ? (
                // Existing recording - show playback/transcribe UI
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileAudio className="w-8 h-8 text-primary" />
                      <div>
                        <p className="font-medium">{currentRecording.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatFileSize(currentRecording.size)} • 
                          Uploaded {format(new Date(currentRecording.uploaded_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDownloadRecording}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                      {!isReadOnly && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="destructive">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Recording</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure? This will permanently delete the audio recording.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={handleDeleteRecording}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                  
                  {/* Transcribe Button - Only show when audio exists and not read-only and no transcript yet */}
                  {!isReadOnly && !interviewTranscript && (
                    <Button
                      onClick={handleTranscribeInterview}
                      disabled={isTranscribingInterview}
                      className="w-full"
                    >
                      {isTranscribingInterview ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Transcribing interview...
                        </>
                      ) : (
                        <>
                          <FileText className="w-4 h-4 mr-2" />
                          Transcribe Interview
                        </>
                      )}
                    </Button>
                  )}
                  
                  {/* Transcription Complete Success State */}
                  {transcriptionJustCompletedInterview && (
                    <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Check className="w-5 h-5 text-green-600" />
                          <div>
                            <p className="text-sm font-medium text-green-800 dark:text-green-200">
                              Transcription complete
                            </p>
                            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                              Review the transcript below, then analyze to extract insights.
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleReviewInterviewTranscript}
                          className="text-green-700 border-green-300 hover:bg-green-100 dark:text-green-300 dark:border-green-700 dark:hover:bg-green-900"
                        >
                          Review Transcript
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {/* Analysis Complete Success State */}
                  {analysisJustCompletedInterview && (
                    <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Sparkles className="w-5 h-5 text-green-600" />
                          <div>
                            <p className="text-sm font-medium text-green-800 dark:text-green-200">
                              Analysis complete
                            </p>
                            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                              Self-assessment insights have been extracted.
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleViewInterviewInsights}
                          className="text-green-700 border-green-300 hover:bg-green-100 dark:text-green-300 dark:border-green-700 dark:hover:bg-green-900"
                        >
                          View Insights
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // No recording yet - show record OR upload options
                <div className="space-y-6">
                  {/* Interview Recorder Component */}
                  <InterviewRecorder
                    evalId={evalId!}
                    draftAudioPath={draftInterviewAudioPath}
                    onDraftAudioSaved={handleDraftInterviewAudioSaved}
                    onDraftAudioCleared={handleDraftInterviewAudioCleared}
                    onRecordingFinalized={handleInterviewRecordingFinalized}
                    hasUploadedRecording={!!currentRecording}
                    isReadOnly={isReadOnly}
                  />
                  
                  {/* Separator */}
                  {!isReadOnly && !draftInterviewAudioPath && (
                    <>
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background px-2 text-muted-foreground">
                            or upload existing recording
                          </span>
                        </div>
                      </div>
                      
                      {/* Upload Section */}
                      <div className="space-y-3">
                        {!selectedFile ? (
                          <div className="border-2 border-dashed rounded-lg p-6 text-center">
                            <input
                              type="file"
                              accept=".mp3,.wav,.m4a,.ogg,.webm,audio/*"
                              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                              disabled={isReadOnly}
                              className="hidden"
                              id="audio-upload"
                            />
                            <label
                              htmlFor="audio-upload"
                              className={cn(
                                "cursor-pointer flex flex-col items-center gap-2",
                                isReadOnly && "cursor-not-allowed opacity-60"
                              )}
                            >
                              <Upload className="w-8 h-8 text-muted-foreground" />
                              <p className="text-sm text-muted-foreground">
                                Click to upload audio recording
                              </p>
                              <p className="text-xs text-muted-foreground">
                                MP3, WAV, M4A, OGG, or WebM (max 100MB)
                              </p>
                            </label>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                              <div className="flex items-center gap-3">
                                <FileAudio className="w-6 h-6" />
                                <div>
                                  <p className="font-medium">{selectedFile.name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {formatFileSize(selectedFile.size)}
                                  </p>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedFile(null)}
                                disabled={isUploading}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                            <Button
                              onClick={handleFileUpload}
                              disabled={isUploading || isReadOnly}
                              className="w-full"
                            >
                              {isUploading ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Uploading...
                                </>
                              ) : (
                                <>
                                  <Upload className="w-4 h-4 mr-2" />
                                  Upload Recording
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                      
                      {/* Paste Transcript Separator */}
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background px-2 text-muted-foreground">
                            or paste existing transcript
                          </span>
                        </div>
                      </div>
                      
                      {/* Paste Transcript Button */}
                      <Button
                        variant="outline"
                        onClick={() => setShowPasteTranscriptDialog(true)}
                        className="w-full gap-2"
                      >
                        <ClipboardPaste className="w-4 h-4" />
                        Paste Transcript
                      </Button>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Paste Transcript Dialog */}
          <AlertDialog open={showPasteTranscriptDialog} onOpenChange={setShowPasteTranscriptDialog}>
            <AlertDialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <ClipboardPaste className="w-5 h-5" />
                  Paste Interview Transcript
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Paste a transcript from another source (e.g., if you recorded on the wrong tab). 
                  You can edit it after pasting, then analyze to extract insights.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex-1 overflow-auto py-4">
                <Textarea
                  placeholder="Paste the interview transcript here..."
                  value={pastedTranscript}
                  onChange={(e) => setPastedTranscript(e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setPastedTranscript('')}>
                  Cancel
                </AlertDialogCancel>
                <Button
                  onClick={handlePasteTranscript}
                  disabled={!pastedTranscript.trim()}
                >
                  Save Transcript
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Interview Transcript - Shows after transcription, collapsible */}
          {interviewTranscript && (
            <Card>
              <CardHeader 
                className="cursor-pointer select-none"
                onClick={() => setIsTranscriptExpanded(!isTranscriptExpanded)}
              >
                <CardTitle className="text-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Interview Transcript
                  </div>
                  <ChevronRight className={cn(
                    "w-5 h-5 transition-transform",
                    isTranscriptExpanded && "rotate-90"
                  )} />
                </CardTitle>
              </CardHeader>
              {isTranscriptExpanded && (
                <CardContent>
                  <div className="space-y-4">
                    <ReactQuill
                      theme="snow"
                      value={interviewTranscript}
                      onChange={handleInterviewTranscriptChange}
                      readOnly={isReadOnly}
                      className="bg-background"
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
                    
                    {/* Analyze & Extract Insights Button - moved here from recording card */}
                    {!isReadOnly && (
                      <div className="pt-4 border-t flex justify-end">
                        <Button
                          onClick={handleAnalyzeInterview}
                          disabled={isParsing}
                          className="gap-2"
                        >
                          {isParsing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Extracting insights...
                            </>
                          ) : (evaluation?.extracted_insights as any)?.self_assessment ? (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Re-analyze Transcript
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Analyze & Extract Insights
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
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}