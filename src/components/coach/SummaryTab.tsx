import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
}

/**
 * SummaryTab — read-only results.
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
}: SummaryTabProps) {
  const isLegacy = isLegacyInterviewEval({
    interview_transcript: interviewTranscript ?? null,
    extracted_insights: extractedInsights,
  });

  const isBaseline = evalType === 'Baseline';

  if (!isLegacy) {
    return (
      <div className="space-y-4">
        {!isBaseline && (
          <ParticipationSnapshotCard
            snapshot={participationSnapshot ?? null}
            evalType={evalType ?? null}
          />
        )}
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
    <InsightsDisplay
      summaryFeedback={summaryFeedback}
      extractedInsights={extractedInsights}
    />
  );
}
