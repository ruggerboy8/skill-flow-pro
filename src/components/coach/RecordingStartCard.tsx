import React, { forwardRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, Loader2, Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecordingStartCardProps {
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  isSavingDraft: boolean;
  onStartRecording: () => void;
  onPauseToggle?: () => void;
  disabled?: boolean;
  hasDraftRecording?: boolean;
  isLoadingDraft?: boolean;
}

export const RecordingStartCard = forwardRef<HTMLDivElement, RecordingStartCardProps>(
  function RecordingStartCard(
    { isRecording, isPaused, recordingTime, isSavingDraft, onStartRecording, onPauseToggle, disabled, hasDraftRecording, isLoadingDraft },
    ref
  ) {
    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    // Don't show the "Start" button if there's a draft - user should see RecordingProcessCard instead
    const showDraftNotice = hasDraftRecording || isLoadingDraft;

    return (
      <Card ref={ref} className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-full",
                isRecording 
                  ? isPaused ? "bg-amber-100 dark:bg-amber-950" : "bg-red-100 dark:bg-red-950"
                  : "bg-muted"
              )}>
                <Mic className={cn(
                  "w-5 h-5",
                  isRecording 
                    ? isPaused ? "text-amber-600" : "text-red-600" 
                    : "text-muted-foreground"
                )} />
              </div>
              <div>
                <h3 className="font-medium text-sm">Record Your Observations</h3>
                {isLoadingDraft ? (
                  <p className="text-xs text-muted-foreground">
                    Loading saved recording...
                  </p>
                ) : showDraftNotice ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Draft recording found — scroll down to review
                  </p>
                ) : isRecording ? (
                  <p className="text-xs text-muted-foreground">
                    {isPaused ? "Paused" : "Recording"}: {formatTime(recordingTime)}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Speak naturally — we'll organize by domain
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isSavingDraft && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </span>
              )}
              
              {isLoadingDraft && (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              )}
              
              {!isRecording && !showDraftNotice && (
                <Button
                  onClick={onStartRecording}
                  disabled={disabled}
                  size="sm"
                  variant="default"
                  className="gap-2"
                >
                  <Mic className="w-4 h-4" />
                  Start
                </Button>
              )}

              {isRecording && (
                <div className="flex items-center gap-2">
                  {/* Status badge */}
                  <span className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                    isPaused 
                      ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                      : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                  )}>
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      isPaused ? "bg-amber-500" : "bg-red-500 animate-pulse"
                    )} />
                    {isPaused ? "Paused" : "Recording"}
                  </span>
                  
                  {/* Pause/Resume button - always visible when recording */}
                  {onPauseToggle && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onPauseToggle}
                      className="gap-1.5"
                    >
                      {isPaused ? (
                        <>
                          <Play className="w-4 h-4" />
                          Resume
                        </>
                      ) : (
                        <>
                          <Pause className="w-4 h-4" />
                          Pause
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Observation starters - show when recording or paused */}
          {isRecording && (
            <div className="mt-4 pt-3 border-t text-sm text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground text-xs">Observation starters:</p>
              <ul className="list-disc list-inside space-y-0.5 text-xs">
                <li>"I liked when you..."</li>
                <li>"Don't forget to..."</li>
                <li>"Instead of ___, try..."</li>
                <li>"I noticed that when ___, you..."</li>
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);
