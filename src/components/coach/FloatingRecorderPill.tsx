import React, { useEffect, useState } from 'react';
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
  activeCompetencyY?: number | null;
  isScrollingFast?: boolean;
  onDoneClick?: () => void;
}

export function FloatingRecorderPill({
  recordingTime,
  isRecording,
  isPaused,
  onPauseToggle,
  onStop,
  activeCompetencyY,
  isScrollingFast,
  onDoneClick,
}: FloatingRecorderPillProps) {
  const isMobile = useIsMobile();
  const [hasSettled, setHasSettled] = useState(false);
  const [prevY, setPrevY] = useState<number | null>(null);

  // Track when Y changes to trigger spring animation
  useEffect(() => {
    if (activeCompetencyY !== null && activeCompetencyY !== prevY) {
      setHasSettled(false);
      const timer = setTimeout(() => setHasSettled(true), 400);
      setPrevY(activeCompetencyY);
      return () => clearTimeout(timer);
    }
  }, [activeCompetencyY, prevY]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isRecording) return null;

  // Calculate dynamic positioning
  // Desktop: left side in margin, aligned with active competency
  // Mobile: bottom center above nav
  const dynamicStyle: React.CSSProperties = isMobile
    ? {}
    : {
        top: activeCompetencyY != null ? `${activeCompetencyY}px` : '50%',
        transform: activeCompetencyY != null 
          ? `translateY(-50%) ${isScrollingFast ? 'translateX(-12px)' : 'translateX(0)'}`
          : 'translateY(-50%)',
        transition: 'top 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.2s ease-out',
      };

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col items-center gap-1",
        // Desktop: left side in margin area
        // Mobile: bottom center, above nav
        isMobile 
          ? "bottom-20 left-1/2 -translate-x-1/2" 
          : "left-4"
      )}
      style={dynamicStyle}
    >
      <div
        className={cn(
          "flex flex-col items-center gap-2 p-3 rounded-2xl",
          "bg-background/95 backdrop-blur-sm border shadow-lg",
          // Pulsing glow when recording, static amber when paused
          isPaused 
            ? "ring-2 ring-amber-500/50" 
            : "animate-pulse-glow",
          // Spring animation when settling to new competency
          !isMobile && !hasSettled && !isScrollingFast && "animate-spring-settle"
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

        {/* "Done?" clickable pill when paused */}
        {isPaused && (
          <Button
            variant="outline"
            size="sm"
            className="rounded-full text-xs px-3 py-1 h-auto animate-fade-in flex items-center gap-1"
            onClick={onDoneClick}
          >
            <span>Done?</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
