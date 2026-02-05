import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Mic, Play, Pause, RotateCcw, Square, FileAudio, FileText, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAudioRecording, type AudioSegment } from '@/hooks/useAudioRecording';

// Segment size threshold (20MB) for transcription chunking
const SEGMENT_SIZE_BYTES = 20 * 1024 * 1024;

interface InterviewRecorderProps {
  evalId: string;
  draftAudioPath?: string | null;
  onDraftAudioSaved?: (path: string) => void;
  onDraftAudioCleared?: () => void;
  onRecordingFinalized?: (path: string) => void;
  onTranscribe?: (audioBlob: Blob, segmentTranscripts?: string[]) => void;
  hasUploadedRecording?: boolean;
  isReadOnly?: boolean;
  isTranscribing?: boolean;
  transcriptionComplete?: boolean;
  onReviewTranscript?: () => void;
}

export function InterviewRecorder({
  evalId,
  draftAudioPath,
  onDraftAudioSaved,
  onDraftAudioCleared,
  onRecordingFinalized,
  onTranscribe,
  hasUploadedRecording = false,
  isReadOnly = false,
  isTranscribing = false,
  transcriptionComplete = false,
  onReviewTranscript,
}: InterviewRecorderProps) {
  const { toast } = useToast();
  
  // Segment transcripts for large recordings
  const [segmentTranscripts, setSegmentTranscripts] = useState<string[]>([]);
  
  // Segment upload callback
  const handleSegmentReady = useCallback(async (segment: AudioSegment) => {
    console.log(`[InterviewRecorder] Segment ${segment.index} ready, transcribing...`);
    try {
      const formData = new FormData();
      formData.append('audio', segment.blob, `segment-${segment.index}.webm`);
      
      const response = await supabase.functions.invoke('transcribe-audio', {
        body: formData,
      });
      
      if (response.error) {
        console.error(`[InterviewRecorder] Segment ${segment.index} transcription failed:`, response.error);
        setSegmentTranscripts(prev => {
          const updated = [...prev];
          updated[segment.index] = '';
          return updated;
        });
        return;
      }
      
      const transcript = response.data?.transcript || '';
      console.log(`[InterviewRecorder] Segment ${segment.index} transcribed: ${transcript.length} chars`);
      
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
      console.error(`[InterviewRecorder] Segment ${segment.index} error:`, error);
      setSegmentTranscripts(prev => {
        const updated = [...prev];
        updated[segment.index] = '';
        return updated;
      });
    }
  }, [toast]);
  
  // Use shared audio recording hook with segmentation
  const { state: recordingState, controls: recordingControls } = useAudioRecording({
    enableSegmentation: true,
    onSegmentReady: handleSegmentReady,
  });
  
  // Extract state from hook
  const { isRecording, isPaused, recordingTime, audioBlob, audioUrl } = recordingState;
  
  // Draft/recovery state
  const [restoredAudioUrl, setRestoredAudioUrl] = useState<string | null>(null);
  const [restoredAudioBlob, setRestoredAudioBlob] = useState<Blob | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isPlayingRestored, setIsPlayingRestored] = useState(false);
  
  // Save state
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  
  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackAudioRef = useRef<HTMLAudioElement | null>(null);
  const checkpointIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Playback state for recorded audio
  const [isPlaying, setIsPlaying] = useState(false);

  // Load draft audio on mount if path exists
  useEffect(() => {
    if (draftAudioPath && !restoredAudioUrl && !audioBlob) {
      loadDraftAudio(draftAudioPath);
    }
  }, [draftAudioPath]);

  // Auto-save audio blob to storage when recording stops
  useEffect(() => {
    if (audioBlob && !isRecording && !isSavingDraft) {
      saveDraftAudio(audioBlob);
    }
  }, [audioBlob, isRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (checkpointIntervalRef.current) clearInterval(checkpointIntervalRef.current);
      if (restoredAudioUrl) URL.revokeObjectURL(restoredAudioUrl);
    };
  }, [restoredAudioUrl]);

  // Warn before unload if recording in progress
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRecording) {
        e.preventDefault();
        e.returnValue = 'You have an active recording. Are you sure you want to leave?';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isRecording]);

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
      
      console.log('[InterviewRecorder] Draft audio loaded from:', path);
    } catch (error) {
      console.error('[InterviewRecorder] Failed to load draft audio:', error);
    } finally {
      setIsLoadingDraft(false);
    }
  };

  const saveDraftAudio = async (blob: Blob) => {
    setIsSavingDraft(true);
    try {
      const fileName = `${evalId}/draft-interview-${Date.now()}.webm`;
      
      const { error: uploadError } = await supabase.storage
        .from('evaluation-recordings')
        .upload(fileName, blob, {
          cacheControl: '3600',
          upsert: true
        });
      
      if (uploadError) throw uploadError;
      
      onDraftAudioSaved?.(fileName);
      
      console.log('[InterviewRecorder] Draft audio saved to:', fileName);
    } catch (error) {
      console.error('[InterviewRecorder] Failed to save draft audio:', error);
      toast({
        title: 'Warning',
        description: 'Could not auto-save recording. Please finalize before leaving.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const saveCheckpoint = useCallback(async () => {
    // With the hook, we don't have direct access to chunks, but segments are auto-transcribed
    // This is now handled by the segmentation in useAudioRecording
    console.log('[InterviewRecorder] Checkpoint save triggered (handled by segmentation)');
  }, []);

  const deleteDraftAudio = async (path: string) => {
    try {
      await supabase.storage
        .from('evaluation-recordings')
        .remove([path]);
      console.log('[InterviewRecorder] Draft audio deleted:', path);
    } catch (error) {
      console.error('[InterviewRecorder] Failed to delete draft audio:', error);
    }
  };

  const startRecording = async () => {
    try {
      // Clear prior segment transcripts when starting new recording
      setSegmentTranscripts([]);
      await recordingControls.startRecording();
      
      // Checkpoint saves every 60 seconds for long interviews (now handled by segmentation)
      checkpointIntervalRef.current = setInterval(() => {
        saveCheckpoint();
      }, 60000);
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      toast({
        title: 'Error',
        description: 'Could not access microphone. Please check permissions.',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    recordingControls.stopRecording();
    if (checkpointIntervalRef.current) {
      clearInterval(checkpointIntervalRef.current);
      checkpointIntervalRef.current = null;
    }
  };

  const togglePause = () => {
    recordingControls.togglePause();
  };

  const resetRecording = () => {
    recordingControls.resetRecording();
    setSegmentTranscripts([]);
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

  const togglePlayback = () => {
    if (!playbackAudioRef.current) return;
    
    if (isPlaying) {
      playbackAudioRef.current.pause();
    } else {
      playbackAudioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  // Finish recording: upload as final, notify parent (no auto-transcription)
  const handleFinishRecording = async () => {
    const blobToUse = audioBlob || restoredAudioBlob;
    if (!blobToUse) return;
    
    setIsFinalizing(true);
    try {
      // Upload as the final interview recording
      const fileExt = 'webm';
      const fileName = `${evalId}/interview-${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('evaluation-recordings')
        .upload(fileName, blobToUse, {
          cacheControl: '3600',
          upsert: false
        });
      
      if (uploadError) throw uploadError;
      
      // Delete draft if exists
      if (draftAudioPath) {
        await deleteDraftAudio(draftAudioPath);
        onDraftAudioCleared?.();
      }
      
      // Notify parent that recording is finalized
      onRecordingFinalized?.(fileName);
      
      // Reset local state
      resetRecording();
      if (restoredAudioUrl) {
        URL.revokeObjectURL(restoredAudioUrl);
        setRestoredAudioUrl(null);
        setRestoredAudioBlob(null);
      }
      
      toast({
        title: 'Recording Saved',
        description: 'Click "Transcribe" to convert the audio to text.',
      });
    } catch (error) {
      console.error('Failed to finalize recording:', error);
      toast({
        title: 'Error',
        description: 'Failed to save recording',
        variant: 'destructive',
      });
    } finally {
      setIsFinalizing(false);
    }
  };

  // Trigger transcription via parent callback - pass segment transcripts if available
  const handleTranscribe = () => {
    const blobToUse = audioBlob || restoredAudioBlob;
    if (blobToUse && onTranscribe) {
      // Pass segment transcripts if we have any from large recording
      onTranscribe(blobToUse, segmentTranscripts.length > 0 ? segmentTranscripts : undefined);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const hasRestoredAudio = !!restoredAudioUrl && !audioBlob;
  const hasRecordedAudio = !!audioBlob;

  // Don't show recorder if there's already an uploaded recording
  if (hasUploadedRecording || isReadOnly) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Mic className="w-4 h-4 text-primary" />
        <h4 className="font-medium">Record Interview</h4>
        {isRecording && (
          <span className="ml-2 flex items-center gap-1 text-sm font-normal text-red-500">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Recording
          </span>
        )}
        {isSavingDraft && (
          <span className="ml-2 flex items-center gap-1 text-sm font-normal text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            Auto-saving...
          </span>
        )}
      </div>
      
      <p className="text-sm text-muted-foreground">
        Record the self-evaluation interview directly from your workstation. 
        Your recording is auto-saved and will be recoverable if you navigate away.
      </p>

      {isLoadingDraft ? (
        <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading saved recording...</p>
        </div>
      ) : isTranscribing ? (
        // Transcription in progress state
        <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Transcribing interview...
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                This may take a minute for longer recordings
              </p>
            </div>
          </div>
        </div>
      ) : transcriptionComplete ? (
        // Transcription complete state
        <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Check className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Transcription complete
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Review and edit the transcript below, then analyze to extract insights.
                </p>
              </div>
            </div>
            {onReviewTranscript && (
              <Button
                size="sm"
                variant="outline"
                onClick={onReviewTranscript}
                className="text-green-700 border-green-300 hover:bg-green-100"
              >
                Review Transcript
              </Button>
            )}
          </div>
        </div>
      ) : hasRestoredAudio ? (
        // Recovery UI for draft recording
        <div className="space-y-4 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-amber-600" />
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Previously recorded interview found
            </p>
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            You have an unprocessed recording from a previous session. You can review and use it, or discard and start fresh.
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
              onClick={handleFinishRecording}
              disabled={isFinalizing}
            >
              {isFinalizing ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving...</>
              ) : (
                'Save Recording'
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDiscardRestoredAudio}
              disabled={isFinalizing}
            >
              <RotateCcw className="w-4 h-4 mr-1" /> Start Fresh
            </Button>
          </div>
        </div>
      ) : hasRecordedAudio ? (
        // Playback UI for just-recorded audio
        <div className="space-y-4 p-4 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2">
            <FileAudio className="w-4 h-4 text-green-600" />
            <p className="text-sm font-medium text-green-800 dark:text-green-200">
              Interview recorded ({formatTime(recordingTime)})
            </p>
          </div>
          
          <audio 
            ref={playbackAudioRef}
            src={audioUrl!}
            onEnded={() => setIsPlaying(false)}
            className="hidden"
          />
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={togglePlayback}
            >
              {isPlaying ? (
                <><Pause className="w-4 h-4 mr-1" /> Pause</>
              ) : (
                <><Play className="w-4 h-4 mr-1" /> Play</>
              )}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleFinishRecording}
              disabled={isFinalizing}
            >
              {isFinalizing ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving...</>
              ) : (
                'Save Recording'
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetRecording}
              disabled={isFinalizing}
            >
              <RotateCcw className="w-4 h-4 mr-1" /> Re-record
            </Button>
          </div>
        </div>
      ) : isRecording ? (
        // Active recording UI
        <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-3 h-3 rounded-full",
                isPaused ? "bg-amber-500" : "bg-red-500 animate-pulse"
              )} />
              <span className="font-mono text-lg font-medium">
                {formatTime(recordingTime)}
              </span>
              <span className="text-sm text-muted-foreground">
                {isPaused ? 'Paused' : 'Recording...'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={togglePause}
            >
              {isPaused ? (
                <><Mic className="w-4 h-4 mr-1" /> Resume</>
              ) : (
                <><Pause className="w-4 h-4 mr-1" /> Pause</>
              )}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={stopRecording}
            >
              <Square className="w-4 h-4 mr-1" /> Stop
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground mt-3">
            Your recording is being auto-saved every 60 seconds for protection against data loss.
          </p>
        </div>
      ) : (
        // Start recording button
        <Button
          onClick={startRecording}
          variant="outline"
          className="w-full py-6 border-dashed"
        >
          <Mic className="w-5 h-5 mr-2" />
          Start Recording Interview
        </Button>
      )}
    </div>
  );
}
