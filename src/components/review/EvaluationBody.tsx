import { Card, CardContent } from '@/components/ui/card';
import { Sun, Sprout } from 'lucide-react';
import { getDomainColorRich } from '@/lib/domainColors';
import type { ReviewDomainBreakdown } from '@/lib/reviewPayload';

/**
 * Shared per-domain evaluation walkthrough body. Renders every competency in
 * each domain with its score shown next to the Glow/Grow story, and a neutral
 * "Did not observe" state. Extracted from EvaluationReviewV2 so the same body
 * can back the staff wizard, a role-aware read view, and the evaluator
 * pre-submit review (see docs/features/evaluation-view-surfaces.md).
 *
 * Presentational only: it takes the v4 payload's domain_breakdown and renders.
 */
export function EvaluationBody({ domains }: { domains: ReviewDomainBreakdown[] }) {
  return (
    <div className="space-y-4">
      {domains.map(domain => (
        <Card
          key={domain.domain_name}
          style={{ borderLeftColor: getDomainColorRich(domain.domain_name), borderLeftWidth: 4 }}
        >
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: getDomainColorRich(domain.domain_name) }}>
                {domain.domain_name}
              </span>
              {domain.observer_avg != null && (
                <span className="text-2xs text-muted-foreground">Avg {domain.observer_avg}</span>
              )}
            </div>
            {domain.items.map(item => (
              <div key={item.competency_id} className="border-t border-border/50 pt-2 first:border-0 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-snug">{item.competency_name}</div>
                    {item.tagline && <div className="text-2xs italic text-muted-foreground">{item.tagline}</div>}
                  </div>
                  {item.observer_is_na ? (
                    <span className="shrink-0 text-2xs text-muted-foreground">Did not observe</span>
                  ) : item.observer_score != null ? (
                    <span
                      className="shrink-0 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-semibold"
                      style={{ backgroundColor: `hsl(var(--score-${item.observer_score}))`, color: 'white' }}
                    >
                      {item.observer_score}
                    </span>
                  ) : null}
                </div>
                {item.observer_is_na ? (
                  <p className="text-2xs text-muted-foreground italic mt-1">Didn't come up this round, not a gap.</p>
                ) : (
                  <div className="mt-1.5 space-y-1">
                    {item.observer_glow?.trim() && (
                      <div className="flex items-start gap-1.5">
                        <Sun className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--score-4))' }} />
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.observer_glow}</p>
                      </div>
                    )}
                    {item.observer_grow?.trim() && (
                      <div className="flex items-start gap-1.5">
                        <Sprout className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: 'hsl(var(--score-2))' }} />
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.observer_grow}</p>
                      </div>
                    )}
                    {!item.observer_glow?.trim() && !item.observer_grow?.trim() && item.observer_note?.trim() && (
                      <p className="text-xs text-muted-foreground leading-relaxed pl-1 border-l-2 border-muted">{item.observer_note}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
