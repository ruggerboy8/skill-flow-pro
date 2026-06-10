import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AudioRecordingState, AudioRecordingControls } from '@/hooks/useAudioRecording';

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  disabled?: boolean;
  className?: string;
  /**
   * Required: the recording lifecycle is fully owned by `useAudioRecording`,
   * so the parent must pass the hook's state + controls. This keeps the timer,
   * pause flag, and blob in a single source of truth and prevents drift
   * between the floating pill, start card, and the recorder UI.
   */
  externalState: AudioRecordingState;
  externalControls: AudioRecordingControls;
}

export function AudioRecorder({
  onRecordingComplete,
  disabled,
  className,
  externalState,
  externalControls,
}: AudioRecorderProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { isRecording, isPaused, recordingTime, audioBlob, audioUrl } = externalState;
  const { startRecording, stopRecording, togglePause, resetRecording } = externalControls;

  // Reset playback state if blob changes / clears
  useEffect(() => {
    if (!audioBlob) setIsPlaying(false);
  }, [audioBlob]);

  const togglePlayback = () => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleSubmit = () => {
    if (audioBlob) onRecordingComplete(audioBlob);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn('space-y-4', className)}>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-3">
          {!audioBlob ? (
            <>
              {!isRecording ? (
                <Button
                  onClick={startRecording}
                  disabled={disabled}
                  variant="outline"
                  className="gap-2"
                >
                  <Mic className="w-4 h-4 text-red-500" />
                  Start Recording
                </Button>
              ) : (
                <>
                  <Button
                    onClick={togglePause}
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                  >
                    {isPaused ? (
                      <Mic className="w-4 h-4 text-red-500" />
                    ) : (
                      <Pause className="w-4 h-4" />
                    )}
                  </Button>
                  <Button
                    onClick={stopRecording}
                    variant="destructive"
                    size="icon"
                    className="shrink-0"
                  >
                    <Square className="w-4 h-4" />
                  </Button>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      isPaused ? "bg-amber-500" : "bg-red-500 animate-pulse"
                    )} />
                    {isPaused ? "Paused" : "Recording"}: {formatTime(recordingTime)}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <Button
                onClick={togglePlayback}
                variant="outline"
                size="icon"
                className="shrink-0"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
              </Button>
              <div className="text-sm text-muted-foreground">
                {formatTime(recordingTime)} recorded
              </div>
              <Button
                onClick={resetRecording}
                variant="ghost"
                size="sm"
                className="text-xs"
              >
                Re-record
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={disabled}
                className="gap-2"
              >
                Transcribe & Format
              </Button>
            </>
          )}
        </div>
        {!audioBlob && !isRecording && (
          <p className="text-xs text-muted-foreground">
            You can pause and resume your recording at any time.
          </p>
        )}
      </div>
    </div>
  );
}
