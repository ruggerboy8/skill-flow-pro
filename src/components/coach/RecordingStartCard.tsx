import React, { forwardRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecordingStartCardProps {
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  isSavingDraft: boolean;
  onStartRecording: () => void;
  disabled?: boolean;
}

export const RecordingStartCard = forwardRef<HTMLDivElement, RecordingStartCardProps>(
  function RecordingStartCard(
    { isRecording, isPaused, recordingTime, isSavingDraft, onStartRecording, disabled },
    ref
  ) {
    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

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
                {isRecording ? (
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
              
              {!isRecording && (
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
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
);
