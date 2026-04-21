import React from 'react';
import DOMPurify from 'dompurify';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { User, FileText, Info } from 'lucide-react';
import { getDomainColorRaw, getDomainColorRichRaw } from '@/lib/domainColors';
import type { ExtractedInsights, DomainInsight, InsightsPerspective } from '@/lib/evaluations';

interface InsightsDisplayProps {
  summaryFeedback: string | null;
  extractedInsights: ExtractedInsights | null;
}

// Helper to get legacy structure as self_assessment perspective
function getLegacyAsSelfAssessment(insights: ExtractedInsights): InsightsPerspective | null {
  if (insights.evaluation_summary_html && insights.domain_insights) {
    return {
      summary_html: insights.evaluation_summary_html,
      domain_insights: insights.domain_insights
    };
  }
  return null;
}

function PerspectiveCard({ perspective }: { perspective: InsightsPerspective }) {
  return (
    <div className="space-y-4">
      {perspective.summary_html && (
        <div 
          className="prose prose-sm max-w-none text-sm"
          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(perspective.summary_html) }}
        />
      )}
      
      {perspective.domain_insights && perspective.domain_insights.length > 0 && (
        <div className="space-y-3">
          {perspective.domain_insights.map((insight, idx) => {
            const bgColor = getDomainColorRaw(insight.domain);
            const accentColor = getDomainColorRichRaw(insight.domain);
            
            return (
              <div 
                key={idx}
                className="p-3 rounded-lg border"
                style={{ 
                  backgroundColor: `hsl(${bgColor})`,
                  borderColor: `hsl(${accentColor} / 0.3)`
                }}
              >
                <Badge 
                  className="mb-2"
                  style={{ 
                    backgroundColor: `hsl(${accentColor} / 0.15)`,
                    color: `hsl(${accentColor})`,
                    borderColor: `hsl(${accentColor} / 0.3)`
                  }}
                >
                  {insight.domain}
                </Badge>
                
                {insight.strengths && insight.strengths.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Strengths
                    </p>
                    <ul className="text-sm space-y-0.5">
                      {insight.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span style={{ color: `hsl(${accentColor})` }}>✓</span>
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {insight.growth_areas && insight.growth_areas.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Growth Opportunities
                    </p>
                    <ul className="text-sm space-y-0.5">
                      {insight.growth_areas.map((g, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span style={{ color: `hsl(${accentColor})` }}>→</span>
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function InsightsDisplay({ summaryFeedback, extractedInsights }: InsightsDisplayProps) {
  // Self-assessment insights (unified or legacy interview-sourced only)
  const selfAssessmentPerspective = extractedInsights?.self_assessment || 
    (extractedInsights ? getLegacyAsSelfAssessment(extractedInsights) : null);

  const hasLegacySummary = !!summaryFeedback && !selfAssessmentPerspective;
  const hasAnyContent = !!selfAssessmentPerspective || hasLegacySummary;

  // No legacy content → render nothing. New evals don't use interview insights.
  if (!hasAnyContent) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Self-scores are now aggregated automatically from weekly performance submissions.
          No interview insights to display.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Legacy Observation Summary */}
      {hasLegacySummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Observation Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div 
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(summaryFeedback || '') }}
            />
          </CardContent>
        </Card>
      )}

      {/* Self-Assessment Insights — legacy only */}
      {selfAssessmentPerspective && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="w-5 h-5" />
              Self-Assessment Insights
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    These insights came from the legacy self-assessment interview flow. We've since moved to averaging weekly performance submissions.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PerspectiveCard perspective={selfAssessmentPerspective} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Re-export types for backwards compatibility
export type { ExtractedInsights, DomainInsight, InsightsPerspective };
