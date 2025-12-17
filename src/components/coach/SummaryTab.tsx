import React from 'react';
import { InsightsDisplay, ExtractedInsights } from './InsightsDisplay';

interface SummaryTabProps {
  summaryFeedback: string | null;
  extractedInsights: ExtractedInsights | null;
}

/**
 * SummaryTab - READ-ONLY results display
 * Shows the observation summary and extracted interview insights.
 * All editing happens in the Observation and Self-Assessment tabs.
 */
export function SummaryTab({ summaryFeedback, extractedInsights }: SummaryTabProps) {
  return (
    <InsightsDisplay 
      summaryFeedback={summaryFeedback}
      extractedInsights={extractedInsights}
    />
  );
}
