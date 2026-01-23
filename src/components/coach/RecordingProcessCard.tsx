import React, { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Mic, Play, Pause, RotateCcw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AudioRecordingState, AudioRecordingControls } from '@/hooks/useAudioRecording';

interface RecordingProcessCardProps {
  recordingState: AudioRecordingState;
  recordingControls: AudioRecordingControls;
  restoredAudioUrl: string | null;
  restoredAudioBlob: Blob | null;
  isLoadingDraft: boolean;
  isProcessing: boolean;
  processingStep: string;
  onProcessAudio: (blob: Blob) => void;
  onDiscardRestored: () => void;
  onStopRecording?: () => void;
}

export function RecordingProcessCard({
  recordingState,
  recordingControls,
  restoredAudioUrl,
  restoredAudioBlob,
  isLoadingDraft,
  isProcessing,
  processingStep,
  onProcessAudio,
  onDiscardRestored,
  onStopRecording,
}: RecordingProcessCardProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlayingRestored, setIsPlayingRestored] = useState(false);
  const [isPlayingCurrent, setIsPlayingCurrent] = useState(false);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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

  const toggleCurrentPlayback = () => {
    if (!audioRef.current) return;
    
    if (isPlayingCurrent) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlayingCurrent(!isPlayingCurrent);
  };

  const handleProcessCurrent = () => {
    if (recordingState.audioBlob) {
      onProcessAudio(recordingState.audioBlob);
    }
  };

  const handleProcessRestored = () => {
    if (restoredAudioBlob) {
      onProcessAudio(restoredAudioBlob);
    }
  };

  // Show when paused (to allow stopping), when stopped with audio, or when processing
  const isPausedWithRecording = recordingState.isRecording && recordingState.isPaused;
  const hasCurrentRecording = !!recordingState.audioBlob && !recordingState.isRecording;
  const hasRestoredRecording = !!restoredAudioUrl && !hasCurrentRecording && !recordingState.isRecording;
  const showCard = isPausedWithRecording || hasCurrentRecording || hasRestoredRecording || isLoadingDraft || isProcessing;

  if (!showCard) {
    return null;
  }

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Process Recording
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoadingDraft ? (
          <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading saved recording...</p>
          </div>
        ) : isProcessing ? (
          <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <div>
              <p className="font-medium text-sm">{processingStep}</p>
              <p className="text-xs text-muted-foreground">This may take a moment...</p>
            </div>
          </div>
        ) : isPausedWithRecording ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">Recording paused</p>
                <p className="text-xs text-muted-foreground">
                  {formatTime(recordingState.recordingTime)} recorded
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={recordingControls.togglePause}
                className="gap-2"
              >
                <Play className="w-4 h-4" />
                Keep Recording
              </Button>
              <Button
                onClick={onStopRecording}
                className="gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Finish & Transcribe
              </Button>
            </div>
          </div>
        ) : hasRestoredRecording ? (
          <div className="space-y-3 p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <div className="flex items-center gap-2">
              <Mic className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Previously recorded observation found
              </p>
            </div>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              You have an unprocessed recording from a previous session.
            </p>
            
            <audio 
              ref={audioRef}
              src={restoredAudioUrl}
              onEnded={() => setIsPlayingRestored(false)}
              className="hidden"
            />
            
            <div className="flex items-center gap-2 flex-wrap">
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
                onClick={handleProcessRestored}
                disabled={isProcessing}
              >
                Transcribe & Format
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDiscardRestored}
                disabled={isProcessing}
              >
                <RotateCcw className="w-4 h-4 mr-1" /> Start Fresh
              </Button>
            </div>
          </div>
        ) : hasCurrentRecording ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <audio 
                ref={audioRef}
                src={recordingState.audioUrl || undefined}
                onEnded={() => setIsPlayingCurrent(false)}
                className="hidden"
              />
              
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 h-10 w-10 rounded-full"
                onClick={toggleCurrentPlayback}
              >
                {isPlayingCurrent ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
              
              <div className="flex-1">
                <p className="text-sm font-medium">Recording ready</p>
                <p className="text-xs text-muted-foreground">
                  {formatTime(recordingState.recordingTime)} recorded
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                onClick={handleProcessCurrent}
                disabled={isProcessing}
                className="gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Transcribe & Format
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={recordingControls.resetRecording}
                disabled={isProcessing}
              >
                <RotateCcw className="w-4 h-4 mr-1" /> Re-record
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
