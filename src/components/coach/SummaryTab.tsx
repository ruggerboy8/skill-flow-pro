import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { MessageSquare } from 'lucide-react';
import { InsightsDisplay, ExtractedInsights } from './InsightsDisplay';
import { isLegacyInterviewEval } from '@/lib/evaluations';
import {
  ParticipationSnapshotCard,
  type ParticipationSnapshot,
} from '@/components/evaluations/ParticipationSnapshotCard';

interface SummaryTabProps {
  summaryFeedback: string | null;
  extractedInsights: ExtractedInsights | null;
  interviewTranscript?: string | null;
  participationSnapshot?: ParticipationSnapshot | null;
  evalType?: string | null;
  evaluatorNote?: string | null;
  evaluatorName?: string | null;
  onEvaluatorNoteChange?: (note: string) => void | Promise<void>;
  readOnly?: boolean;
}

/**
 * SummaryTab — read-only results + evaluator's free-form final note.
 * For new (post-interview) evals we show the participation snapshot the staff
 * member will see, so coaches can preview before submitting.
 * Legacy evals with interview-sourced insights still render the rich display.
 */
export function SummaryTab({
  summaryFeedback,
  extractedInsights,
  interviewTranscript,
  participationSnapshot,
  evalType,
  evaluatorNote,
  evaluatorName,
  onEvaluatorNoteChange,
  readOnly = false,
}: SummaryTabProps) {
  const isLegacy = isLegacyInterviewEval({
    interview_transcript: interviewTranscript ?? null,
    extracted_insights: extractedInsights,
  });

  const isBaseline = evalType === 'Baseline';
  const [draftNote, setDraftNote] = useState(evaluatorNote ?? '');

  useEffect(() => {
    setDraftNote(evaluatorNote ?? '');
  }, [evaluatorNote]);

  const evaluatorNoteCard = (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          A note from {evaluatorName || 'the evaluator'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {readOnly ? (
          draftNote.trim() ? (
            <p className="text-sm whitespace-pre-wrap">{draftNote}</p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No note added.</p>
          )
        ) : (
          <div className="space-y-2">
            <Label htmlFor="evaluator-note" className="sr-only">
              Final note to staff member
            </Label>
            <Textarea
              id="evaluator-note"
              placeholder="Free-form thoughts, encouragement, or context to share with the staff member. They'll see this on their copy of the evaluation."
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              onBlur={() => {
                if ((evaluatorNote ?? '') !== draftNote) {
                  onEvaluatorNoteChange?.(draftNote);
                }
              }}
              rows={5}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Saves automatically when you click away. Visible to the staff member after release.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (!isLegacy) {
    return (
      <div className="space-y-4">
        {!isBaseline && (
          <ParticipationSnapshotCard
            snapshot={participationSnapshot ?? null}
            evalType={evalType ?? null}
          />
        )}
        {evaluatorNoteCard}
        {!summaryFeedback && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              {isBaseline
                ? 'Baseline evaluations show observer scores only.'
                : 'This is what the staff member will see once you release the evaluation. The participation snapshot above will be frozen at submission time.'}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {evaluatorNoteCard}
      <InsightsDisplay
        summaryFeedback={summaryFeedback}
        extractedInsights={extractedInsights}
      />
    </div>
  );
}
