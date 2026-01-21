import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Mic, Play, Pause, RotateCcw, Square, Upload, FileAudio } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface InterviewRecorderProps {
  evalId: string;
  draftAudioPath?: string | null;
  onDraftAudioSaved?: (path: string) => void;
  onDraftAudioCleared?: () => void;
  onRecordingFinalized?: (path: string) => void;
  hasUploadedRecording?: boolean;
  isReadOnly?: boolean;
}

export function InterviewRecorder({
  evalId,
  draftAudioPath,
  onDraftAudioSaved,
  onDraftAudioCleared,
  onRecordingFinalized,
  hasUploadedRecording = false,
  isReadOnly = false,
}: InterviewRecorderProps) {
  const { toast } = useToast();
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  
  // Draft/recovery state
  const [restoredAudioUrl, setRestoredAudioUrl] = useState<string | null>(null);
  const [restoredAudioBlob, setRestoredAudioBlob] = useState<Blob | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isPlayingRestored, setIsPlayingRestored] = useState(false);
  
  // Save state
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
      if (timerRef.current) clearInterval(timerRef.current);
      if (checkpointIntervalRef.current) clearInterval(checkpointIntervalRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (restoredAudioUrl) URL.revokeObjectURL(restoredAudioUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

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
    if (!isRecording || audioChunksRef.current.length === 0) return;
    
    try {
      const checkpointBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const fileName = `${evalId}/checkpoint-interview-${Date.now()}.webm`;
      
      await supabase.storage
        .from('evaluation-recordings')
        .upload(fileName, checkpointBlob, {
          cacheControl: '3600',
          upsert: true
        });
      
      console.log('[InterviewRecorder] Checkpoint saved:', fileName);
    } catch (error) {
      console.error('[InterviewRecorder] Checkpoint save failed:', error);
    }
  }, [isRecording, evalId]);

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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        
        // Clear checkpoint interval
        if (checkpointIntervalRef.current) {
          clearInterval(checkpointIntervalRef.current);
          checkpointIntervalRef.current = null;
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      
      // Timer for display
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
      // Checkpoint saves every 60 seconds for long interviews
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
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const togglePause = () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    
    if (isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const resetRecording = () => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordingTime(0);
    setIsRecording(false);
    setIsPaused(false);
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

  const handleUseRecording = async () => {
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
        title: 'Success',
        description: 'Interview recording saved successfully',
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
              onClick={handleUseRecording}
              disabled={isFinalizing}
            >
              {isFinalizing ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving...</>
              ) : (
                'Use This Recording'
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
              onClick={handleUseRecording}
              disabled={isFinalizing}
            >
              {isFinalizing ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving...</>
              ) : (
                'Use This Recording'
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
