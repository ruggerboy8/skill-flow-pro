import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface FloatingRecorderPillProps {
  recordingTime: number;
  isRecording: boolean;
  isPaused: boolean;
  onPauseToggle: () => void;
  onDoneClick?: () => void;
}

export function FloatingRecorderPill({
  recordingTime,
  isRecording,
  isPaused,
  onPauseToggle,
  onDoneClick,
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
        isMobile 
          ? "bottom-20 left-1/2 -translate-x-1/2" 
          : "left-4 top-1/2 -translate-y-1/2"
      )}
    >
      <div
        className={cn(
          "flex flex-col items-center gap-2 p-3 rounded-2xl",
          "bg-background/95 backdrop-blur-sm border shadow-lg",
          isPaused 
            ? "ring-2 ring-amber-500/50" 
            : "animate-pulse-glow"
        )}
      >
        {/* Single toggle button - the indicator IS the button */}
        <button 
          onClick={onPauseToggle}
          className="flex flex-col items-center gap-1.5 px-4 py-3 rounded-xl hover:bg-muted/50 active:scale-95 transition-all cursor-pointer"
        >
          {/* Large clickable circle indicator */}
          <span
            className={cn(
              "w-6 h-6 rounded-full shadow-md transition-colors",
              "ring-2 ring-offset-2 ring-offset-background",
              isPaused 
                ? "bg-amber-500 ring-amber-500/50" 
                : "bg-destructive ring-destructive/50 animate-pulse"
            )}
          />
          <span className="text-sm font-mono font-medium tabular-nums text-muted-foreground">
            {formatTime(recordingTime)}
          </span>
          {isPaused && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              paused
            </span>
          )}
        </button>

        {/* Done? pill - only when paused */}
        {isPaused && (
          <Button
            variant="destructive"
            size="sm"
            className="rounded-full text-xs px-4"
            onClick={onDoneClick}
          >
            Done?
          </Button>
        )}
      </div>
    </div>
  );
}
