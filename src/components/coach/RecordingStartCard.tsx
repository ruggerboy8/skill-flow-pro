import React, { forwardRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, Loader2, Pause, Play, CheckCircle2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface RecordingStartCardProps {
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  isSavingDraft: boolean;
  onStartRecording: () => void;
  onPauseToggle?: () => void;
  onStartOver?: () => void;
  disabled?: boolean;
  hasDraftRecording?: boolean;
  isLoadingDraft?: boolean;
  hasExistingInsights?: boolean;
  activeCompetencyLabel?: string;
}

export const RecordingStartCard = forwardRef<HTMLDivElement, RecordingStartCardProps>(
  function RecordingStartCard(
    { isRecording, isPaused, recordingTime, isSavingDraft, onStartRecording, onPauseToggle, onStartOver, disabled, hasDraftRecording, isLoadingDraft, hasExistingInsights, activeCompetencyLabel },
    ref
  ) {
    const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);

    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };
    
    // Don't show the "Start" button if there's a draft - user should see RecordingProcessCard instead
    const showDraftNotice = hasDraftRecording || isLoadingDraft;

    const handleStartClick = () => {
      if (hasExistingInsights) {
        setShowReplaceConfirm(true);
      } else {
        onStartRecording();
      }
    };

    const handleConfirmReplace = () => {
      setShowReplaceConfirm(false);
      onStartRecording();
    };

    return (
      <>
        <Card ref={ref} className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-full",
                  hasExistingInsights && !isRecording
                    ? "bg-[hsl(var(--status-complete-bg))]"
                    : isRecording
                      ? isPaused ? "bg-[hsl(var(--status-late-bg))]" : "bg-[hsl(var(--status-missing-bg))]"
                      : "bg-muted"
                )}>
                  {hasExistingInsights && !isRecording ? (
                    <CheckCircle2 className="w-5 h-5 text-[hsl(var(--status-complete))]" />
                  ) : (
                    <Mic className={cn(
                      "w-5 h-5",
                      isRecording
                        ? isPaused ? "text-[hsl(var(--status-late))]" : "text-[hsl(var(--status-missing))]"
                        : "text-muted-foreground"
                    )} />
                  )}
                </div>
                <div>
                  <h3 className="font-medium text-sm">
                    {hasExistingInsights && !isRecording 
                      ? "Verbal Feedback Processed" 
                      : "Record Your Observations"
                    }
                  </h3>
                  {isLoadingDraft ? (
                    <p className="text-xs text-muted-foreground">
                      Loading saved recording...
                    </p>
                  ) : showDraftNotice ? (
                    <p className="text-xs text-[hsl(var(--status-late))]">
                      Draft recording found — scroll down to review
                    </p>
                  ) : hasExistingInsights && !isRecording ? (
                    <p className="text-xs text-[hsl(var(--status-complete))]">
                      Notes have been mapped to competencies below
                    </p>
                  ) : isRecording ? (
                    <p className="text-xs text-muted-foreground">
                      {isPaused ? "Paused" : "Recording"}: {formatTime(recordingTime)}
                      {activeCompetencyLabel && !isPaused && (
                        <span className="block text-2xs text-primary/70 mt-0.5 truncate max-w-[200px]">
                          Recording for: {activeCompetencyLabel}
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Tap a competency, speak your feedback, then tap the next one
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
                    onClick={handleStartClick}
                    disabled={disabled}
                    size="sm"
                    variant={hasExistingInsights ? "outline" : "default"}
                    className="gap-2"
                  >
                    <Mic className="w-4 h-4" />
                    {hasExistingInsights ? "Re-record" : "Start"}
                  </Button>
                )}

                {isRecording && (
                  <div className="flex items-center gap-2">
                    {/* Status badge — reuses --status-missing's red hue rather
                        than bg-destructive/10 + text-destructive: --destructive's
                        dark-mode value is a low-lightness red tuned for solid
                        fills (buttons), not text on a tinted background, and
                        paired with a 10%-opacity tint it was unreadably dark
                        in dark mode. --status-missing is mode-invariant and
                        already proven for this exact tinted-bg/colored-text
                        pairing via StatusBadge. */}
                    <span className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium",
                      isPaused
                        ? "bg-[hsl(var(--status-late-bg))] text-[hsl(var(--status-late))]"
                        : "bg-[hsl(var(--status-missing-bg))] text-[hsl(var(--status-missing))]"
                    )}>
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        isPaused ? "bg-[hsl(var(--status-late))]" : "bg-[hsl(var(--status-missing))] animate-pulse"
                      )} />
                      {isPaused ? "Paused" : "Recording"}
                    </span>
                    
                    {/* Pause/Resume button */}
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

                    {/* Start Over button */}
                    {onStartOver && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={onStartOver}
                        className="gap-1.5 text-muted-foreground"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Start Over
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* How this works - show when recording */}
            {isRecording && (
              <div className="mt-4 pt-3 border-t text-sm text-muted-foreground space-y-1.5">
                <p className="font-medium text-foreground text-xs">How this works:</p>
                <ul className="list-disc list-inside space-y-0.5 text-xs">
                  <li>Tap a competency to start talking about it</li>
                  <li>Speak clearly about strengths and growth areas</li>
                  <li>Tap the next competency when you move on</li>
                  <li>Your feedback will be automatically mapped to each competency's notes</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Confirmation dialog for replacing existing insights */}
        <AlertDialog open={showReplaceConfirm} onOpenChange={setShowReplaceConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Replace Existing Feedback?</AlertDialogTitle>
              <AlertDialogDescription>
                This evaluation already has verbal feedback that has been processed. Recording new audio will replace the existing notes. Are you sure you want to continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmReplace}>
                Yes, Re-record
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }
);
