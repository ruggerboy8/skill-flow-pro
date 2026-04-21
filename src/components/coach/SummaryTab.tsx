import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { InsightsDisplay, ExtractedInsights } from './InsightsDisplay';
import { isLegacyInterviewEval } from '@/lib/evaluations';

interface SummaryTabProps {
  summaryFeedback: string | null;
  extractedInsights: ExtractedInsights | null;
  interviewTranscript?: string | null;
}

/**
 * SummaryTab — read-only results.
 * For new evals (no interview), there's nothing to summarize beyond what's on
 * the Observation tab. We surface a neutral placeholder so the tab isn't blank.
 * Legacy evals with interview-sourced insights still render the rich display.
 */
export function SummaryTab({ summaryFeedback, extractedInsights, interviewTranscript }: SummaryTabProps) {
  const isLegacy = isLegacyInterviewEval({
    interview_transcript: interviewTranscript ?? null,
    extracted_insights: extractedInsights,
  });

  if (!isLegacy && !summaryFeedback) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Summary insights will appear here once we have AI summarization wired into coach notes.
          For now, all observation data lives on the Observation tab.
        </CardContent>
      </Card>
    );
  }

  return (
    <InsightsDisplay
      summaryFeedback={summaryFeedback}
      extractedInsights={extractedInsights}
    />
  );
}
