import React from 'react';
import { Button } from '@/components/ui/button';
import { Pause, Play, Square, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface FloatingRecorderPillProps {
  recordingTime: number;
  isRecording: boolean;
  isPaused: boolean;
  onPauseToggle: () => void;
  onStop: () => void;
}

export function FloatingRecorderPill({
  recordingTime,
  isRecording,
  isPaused,
  onPauseToggle,
  onStop,
}: FloatingRecorderPillProps) {
  const isMobile = useIsMobile();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isRecording) return null;

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col items-center gap-1",
        // Desktop: left side, vertically centered
        // Mobile: bottom center, above nav
        isMobile 
          ? "bottom-20 left-1/2 -translate-x-1/2" 
          : "left-4 top-1/2 -translate-y-1/2"
      )}
    >
      <div
        className={cn(
          "flex flex-col items-center gap-2 p-3 rounded-2xl",
          "bg-background/95 backdrop-blur-sm border shadow-lg",
          // Pulsing glow when recording, static amber when paused
          isPaused 
            ? "ring-2 ring-amber-500/50" 
            : "animate-pulse-glow"
        )}
      >
        {/* Recording indicator + time */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "w-2.5 h-2.5 rounded-full",
              isPaused ? "bg-amber-500" : "bg-red-500 animate-pulse"
            )}
          />
          <span className="text-sm font-mono font-medium tabular-nums">
            {formatTime(recordingTime)}
          </span>
        </div>

        {/* Control buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={onPauseToggle}
          >
            {isPaused ? (
              <Play className="h-4 w-4 text-primary" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="destructive"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={onStop}
          >
            <Square className="h-4 w-4" />
          </Button>
        </div>

        {/* "Done?" hint when paused */}
        {isPaused && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground animate-fade-in">
            <span>Done?</span>
            <ChevronDown className="h-3 w-3" />
          </div>
        )}
      </div>
    </div>
  );
}
