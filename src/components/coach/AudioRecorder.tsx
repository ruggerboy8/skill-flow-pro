import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, Square, Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioRecorderProps {
  onRecordingComplete: (audioBlob: Blob) => void;
  disabled?: boolean;
  className?: string;
}

export function AudioRecorder({ onRecordingComplete, disabled, className }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
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
      // Resume timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      // Pause timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

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
    if (audioBlob) {
      onRecordingComplete(audioBlob);
    }
  };

  const resetRecording = () => {
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordingTime(0);
    setIsPlaying(false);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Audio element for playback */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      <div className="flex items-center gap-3">
        {!audioBlob ? (
          <>
            {/* Recording controls */}
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
            {/* Playback controls */}
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
    </div>
  );
}
