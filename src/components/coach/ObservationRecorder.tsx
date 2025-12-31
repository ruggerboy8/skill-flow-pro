import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Mic, Play, Pause, RotateCcw } from 'lucide-react';
import { AudioRecorder } from './AudioRecorder';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { updateExtractedInsights } from '@/lib/evaluations';
import type { AudioRecordingState, AudioRecordingControls } from '@/hooks/useAudioRecording';
import type { ExtractedInsights, InsightsPerspective } from '@/lib/evaluations';

interface ObservationRecorderProps {
  evalId: string;
  staffName: string;
  onFeedbackGenerated: (feedback: string, transcript: string, insights?: InsightsPerspective) => void;
  recordingState: AudioRecordingState;
  recordingControls: AudioRecordingControls;
  currentInsights?: ExtractedInsights | null;
  draftAudioPath?: string | null;
  onDraftAudioSaved?: (path: string) => void;
  onDraftAudioCleared?: () => void;
}

export function ObservationRecorder({
  evalId,
  staffName,
  onFeedbackGenerated,
  recordingState,
  recordingControls,
  currentInsights,
  draftAudioPath,
  onDraftAudioSaved,
  onDraftAudioCleared,
}: ObservationRecorderProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  
  // For restored draft audio playback
  const [restoredAudioUrl, setRestoredAudioUrl] = useState<string | null>(null);
  const [restoredAudioBlob, setRestoredAudioBlob] = useState<Blob | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isPlayingRestored, setIsPlayingRestored] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load draft audio on mount if path exists
  useEffect(() => {
    if (draftAudioPath && !restoredAudioUrl && !recordingState.audioBlob) {
      loadDraftAudio(draftAudioPath);
    }
  }, [draftAudioPath]);

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
      
      console.log('[ObservationRecorder] Draft audio loaded from:', path);
    } catch (error) {
      console.error('[ObservationRecorder] Failed to load draft audio:', error);
      // Don't show error toast - the file might have been deleted
    } finally {
      setIsLoadingDraft(false);
    }
  };

  const saveDraftAudio = async (blob: Blob) => {
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
      
      // Notify parent to update database
      onDraftAudioSaved?.(fileName);
      
      console.log('[ObservationRecorder] Draft audio saved to:', fileName);
    } catch (error) {
      console.error('[ObservationRecorder] Failed to save draft audio:', error);
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
      console.log('[ObservationRecorder] Draft audio deleted:', path);
    } catch (error) {
      console.error('[ObservationRecorder] Failed to delete draft audio:', error);
    }
  };

  const handleRecordingComplete = async (audioBlob: Blob) => {
    setIsProcessing(true);
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

      const transcript = transcribeResponse.data?.transcript;
      if (!transcript) {
        throw new Error('No transcript returned');
      }

      // Step 2: Extract insights using extract-insights with source='observation'
      setProcessingStep('Extracting insights...');

      const extractResponse = await supabase.functions.invoke('extract-insights', {
        body: { transcript, staffName, source: 'observation' },
      });

      if (extractResponse.error) {
        throw new Error(extractResponse.error.message || 'Insight extraction failed');
      }

      const insights = extractResponse.data?.insights as InsightsPerspective;
      if (!insights) {
        throw new Error('No insights returned');
      }

      // Step 3: Save to database - merge with existing insights
      const updatedInsights: ExtractedInsights = {
        ...currentInsights,
        observer: insights
      };
      
      await updateExtractedInsights(evalId, updatedInsights);

      // Step 4: Delete draft audio after successful processing
      if (draftAudioPath) {
        await deleteDraftAudio(draftAudioPath);
        onDraftAudioCleared?.();
      }

      // Pass feedback and insights up to parent
      // Use summary_html as the formatted feedback for backwards compatibility
      onFeedbackGenerated(insights.summary_html || '', transcript, insights);

      // Reset recording state after successful processing
      recordingControls.resetRecording();
      
      // Clear restored audio state
      if (restoredAudioUrl) {
        URL.revokeObjectURL(restoredAudioUrl);
        setRestoredAudioUrl(null);
        setRestoredAudioBlob(null);
      }

      toast({
        title: 'Success',
        description: 'Observations transcribed and analyzed successfully',
      });
    } catch (error) {
      console.error('[ObservationRecorder] Processing error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to process audio',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const handleProcessRestoredAudio = () => {
    if (restoredAudioBlob) {
      handleRecordingComplete(restoredAudioBlob);
    }
  };

  const handleDiscardRestoredAudio = async () => {
    if (draftAudioPath) {
      await deleteDraftAudio(draftAudioPath);
      onDraftAudioCleared?.();
    }
    if (restoredAudioUrl) {
      URL.revokeObjectURL(restoredAudioUrl);
    }
    setRestoredAudioUrl(null);
    setRestoredAudioBlob(null);
  };

  const toggleRestoredPlayback = () => {
    if (!audioRef.current) return;
    
    if (isPlayingRestored) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlayingRestored(!isPlayingRestored);
  };

  const isRecordingInProgress = recordingState?.isRecording || false;
  const hasRestoredAudio = !!restoredAudioUrl && !recordingState.audioBlob;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mic className="w-5 h-5" />
          Record Your Observations
          {isRecordingInProgress && (
            <span className="ml-2 flex items-center gap-1 text-sm font-normal text-red-500">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              Recording in progress
            </span>
          )}
          {isSavingDraft && (
            <span className="ml-2 flex items-center gap-1 text-sm font-normal text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving...
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          After completing your competency scores below, record your overall thoughts. Speak naturally—our system 
          will analyze your feedback and organize it by domain.
        </p>
        
        <div className="mb-4 space-y-3">
          <p className="text-sm font-medium">What to cover:</p>
          <ul className="text-sm text-muted-foreground space-y-1.5 list-disc list-inside ml-2">
            <li><strong>The "Big Picture":</strong> How are they doing generally?</li>
            <li><strong>Nuance on the Scores:</strong> Explain specific behaviors behind your ratings.</li>
            <li><strong>Encouragement:</strong> End with a forward-looking statement.</li>
          </ul>
        </div>
        
        <div className="mb-4 p-3 bg-muted/50 rounded-lg">
          <p className="text-sm font-medium mb-2">Stuck? Try these starters:</p>
          <ul className="text-sm text-muted-foreground space-y-1 italic">
            <li>"I want to highlight how well you handled..."</li>
            <li>"Regarding the [Clinical/Clerical] score, what I really meant was..."</li>
            <li>"A specific example of where I see room for growth is..."</li>
            <li>"Overall, I really appreciate that you..."</li>
          </ul>
        </div>

        {isLoadingDraft ? (
          <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading saved recording...</p>
          </div>
        ) : hasRestoredAudio ? (
          <div className="space-y-4 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Previously recorded observation found
              </p>
            </div>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              You have an unprocessed recording from a previous session. You can review and submit it, or discard and start fresh.
            </p>
            
            <audio 
              ref={audioRef}
              src={restoredAudioUrl}
              onEnded={() => setIsPlayingRestored(false)}
              className="hidden"
            />
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleRestoredPlayback}
              >
                {isPlayingRestored ? (
                  <><Pause className="w-4 h-4 mr-1" /> Pause</>
                ) : (
                  <><Play className="w-4 h-4 mr-1" /> Play</>
                )}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleProcessRestoredAudio}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> {processingStep}</>
                ) : (
                  'Transcribe & Format'
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDiscardRestoredAudio}
                disabled={isProcessing}
              >
                <RotateCcw className="w-4 h-4 mr-1" /> Start Fresh
              </Button>
            </div>
          </div>
        ) : isProcessing ? (
          <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <div>
              <p className="font-medium">{processingStep}</p>
              <p className="text-sm text-muted-foreground">This may take a moment...</p>
            </div>
          </div>
        ) : (
          <AudioRecorder
            onRecordingComplete={handleRecordingComplete}
            disabled={isProcessing}
            externalState={recordingState}
            externalControls={recordingControls}
          />
        )}
      </CardContent>
    </Card>
  );
}
